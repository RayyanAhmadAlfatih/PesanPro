import crypto from "node:crypto";
import { Prisma, type ScheduledMessage, type ScheduleExecution } from "@prisma/client";
import { requireEntitlement } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { enqueueMessage } from "./message-job-service";
import { prisma } from "./prisma";
import { isMissedRun, nextCronOccurrence, occurrenceKey } from "./schedule-policy";
import { createWebhookOutboxEvent } from "./webhook-outbox";

export const DEFAULT_SCHEDULE_LEASE_MS = 30_000;

type ScheduleWithRuntime = ScheduledMessage & {
  session: { sessionId: string; user: { id: string; role: "SUPERADMIN" | "USER"; ownerId: string | null } };
  media: { id: string; mediaType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT"; status: "ACTIVE" | "DELETED" | "QUARANTINED" } | null;
};

export type ClaimedSchedule = {
  schedule: ScheduleWithRuntime;
  execution: ScheduleExecution;
  claimToken: string;
  leaseMs: number;
};

export async function claimNextDueSchedule(workerId: string, leaseMs = DEFAULT_SCHEDULE_LEASE_MS): Promise<ClaimedSchedule | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE ScheduledMessage AS scheduleRow
    INNER JOIN (
      SELECT candidate.id
      FROM (
        SELECT id
        FROM ScheduledMessage
        WHERE status = 'ACTIVE'
          AND sendAt <= ${now}
          AND (lockedBy IS NULL OR leaseExpiresAt < ${now})
        ORDER BY sendAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = scheduleRow.id
    SET
      scheduleRow.lockedBy = ${claimToken},
      scheduleRow.leaseExpiresAt = ${leaseExpiresAt},
      scheduleRow.heartbeatAt = ${now},
      scheduleRow.updatedAt = ${now}
    WHERE scheduleRow.status = 'ACTIVE'
      AND scheduleRow.sendAt <= ${now}
      AND (scheduleRow.lockedBy IS NULL OR scheduleRow.leaseExpiresAt < ${now})
  `);
  if (claimed !== 1) return null;

  const schedule = await prisma.scheduledMessage.findFirst({
    where: { lockedBy: claimToken, status: "ACTIVE" },
    include: {
      session: { select: { sessionId: true, user: { select: { id: true, role: true, ownerId: true } } } },
      media: { select: { id: true, mediaType: true, status: true } },
    },
  }) as ScheduleWithRuntime | null;
  if (!schedule) return null;
  const ownership = await heartbeatSchedule(schedule.id, claimToken, leaseMs);
  if (ownership.count !== 1) return null;
  const key = occurrenceKey(schedule.version, schedule.nextRunAt);
  let execution = await prisma.scheduleExecution.findUnique({
    where: { scheduleId_occurrenceKey: { scheduleId: schedule.id, occurrenceKey: key } },
  });
  if (!execution) {
    try {
      execution = await prisma.scheduleExecution.create({
        data: {
          scheduleId: schedule.id,
          occurrenceKey: key,
          scheduledFor: schedule.nextRunAt,
          workerId,
          claimToken,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      execution = await prisma.scheduleExecution.findUniqueOrThrow({
        where: { scheduleId_occurrenceKey: { scheduleId: schedule.id, occurrenceKey: key } },
      });
    }
  } else if (execution.status === "CLAIMED") {
    execution = await prisma.scheduleExecution.update({
      where: { id: execution.id },
      data: { workerId, claimToken, attempt: { increment: 1 }, startedAt: now },
    });
  }
  return { schedule, execution, claimToken, leaseMs };
}

export function heartbeatSchedule(scheduleId: string, claimToken: string, leaseMs = DEFAULT_SCHEDULE_LEASE_MS) {
  const now = new Date();
  return prisma.scheduledMessage.updateMany({
    where: { id: scheduleId, status: "ACTIVE", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

function nextScheduleState(schedule: ScheduleWithRuntime, now: Date) {
  if (schedule.kind === "ONE_TIME") {
    return { status: "COMPLETED" as const, completedAt: now, nextRunAt: schedule.nextRunAt };
  }
  if (!schedule.cronExpression) throw new MessageJobError("INVALID_CRON", "Recurring schedule has no cron expression", 422, false);
  return {
    status: "ACTIVE" as const,
    completedAt: null,
    nextRunAt: nextCronOccurrence(schedule.cronExpression, schedule.timezone, now),
  };
}

async function finalizeSchedule(claim: ClaimedSchedule, input: { errorCode?: string; errorMessage?: string }) {
  const now = new Date();
  const next = nextScheduleState(claim.schedule, now);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.scheduledMessage.updateMany({
      where: { id: claim.schedule.id, status: "ACTIVE", lockedBy: claim.claimToken },
      data: {
        ...next,
        lastRunAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: input.errorCode ?? null,
        safeErrorMessage: input.errorMessage ?? null,
      },
    });
    if (updated.count !== 1) return false;
    await createWebhookOutboxEvent(tx, {
      tenantId: claim.schedule.session.user.id,
      sessionDbId: claim.schedule.sessionId,
      sessionPublicId: claim.schedule.session.sessionId,
      eventType: "schedule.status",
      eventKey: `schedule:${claim.schedule.id}:${claim.execution.id}:${next.status}:${input.errorCode ?? "OK"}`,
      data: { scheduleId: claim.schedule.id, executionId: claim.execution.id, status: next.status, errorCode: input.errorCode ?? null },
      now,
    });
    return true;
  });
}

export async function executeClaimedSchedule(claim: ClaimedSchedule, now = new Date()) {
  const ownership = await heartbeatSchedule(claim.schedule.id, claim.claimToken, claim.leaseMs);
  if (ownership.count !== 1) return { action: "CLAIM_LOST" as const, finalized: false };
  if (claim.execution.status === "ENQUEUED") {
    return { action: "ENQUEUED" as const, finalized: await finalizeSchedule(claim, {}) };
  }
  if (claim.execution.status === "SKIPPED") {
    return {
      action: "SKIPPED" as const,
      finalized: await finalizeSchedule(claim, {
        errorCode: claim.execution.safeErrorCode ?? "MISSED_RUN_SKIPPED",
        errorMessage: claim.execution.safeErrorMessage ?? "Missed occurrence was skipped",
      }),
    };
  }
  if (claim.execution.status === "FAILED") {
    await prisma.scheduledMessage.updateMany({
      where: { id: claim.schedule.id, status: "ACTIVE", lockedBy: claim.claimToken },
      data: {
        status: "FAILED",
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: claim.execution.safeErrorCode ?? "SCHEDULE_EXECUTION_FAILED",
        safeErrorMessage: claim.execution.safeErrorMessage ?? "Schedule execution failed",
      },
    });
    return { action: "FAILED" as const, finalized: true };
  }

  const missed = isMissedRun(claim.execution.scheduledFor, now, claim.schedule.misfireGraceSeconds);
  if (missed && claim.schedule.missedRunPolicy === "CANCEL") {
    const finalized = await prisma.$transaction(async (tx) => {
      const schedule = await tx.scheduledMessage.updateMany({
        where: { id: claim.schedule.id, status: "ACTIVE", lockedBy: claim.claimToken },
        data: { status: "CANCELLED", cancelledAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, safeErrorCode: "MISSED_RUN_CANCELLED", safeErrorMessage: "Schedule cancelled after missing its occurrence" },
      });
      if (schedule.count === 0) return false;
      await tx.scheduleExecution.updateMany({
        where: { id: claim.execution.id, claimToken: claim.claimToken },
        data: { status: "SKIPPED", safeErrorCode: "MISSED_RUN_CANCELLED", safeErrorMessage: "Schedule cancelled after missing its occurrence", finishedAt: now },
      });
      await createWebhookOutboxEvent(tx, {
        tenantId: claim.schedule.session.user.id,
        sessionDbId: claim.schedule.sessionId,
        sessionPublicId: claim.schedule.session.sessionId,
        eventType: "schedule.status",
        eventKey: `schedule:${claim.schedule.id}:${claim.execution.id}:CANCELLED`,
        data: { scheduleId: claim.schedule.id, executionId: claim.execution.id, status: "CANCELLED", errorCode: "MISSED_RUN_CANCELLED" },
        now,
      });
      return true;
    });
    return { action: "CANCELLED" as const, finalized };
  }
  if (missed && claim.schedule.missedRunPolicy === "SKIP") {
    await prisma.scheduleExecution.updateMany({
      where: { id: claim.execution.id, status: "CLAIMED", claimToken: claim.claimToken },
      data: { status: "SKIPPED", safeErrorCode: "MISSED_RUN_SKIPPED", safeErrorMessage: "Missed occurrence was skipped", finishedAt: now },
    });
    return { action: "SKIPPED" as const, finalized: await finalizeSchedule(claim, { errorCode: "MISSED_RUN_SKIPPED", errorMessage: "Missed occurrence was skipped" }) };
  }

  await requireEntitlement(claim.schedule.session.user.id, "SCHEDULED_MESSAGES");
  if (claim.schedule.media && claim.schedule.media.status !== "ACTIVE") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "Scheduled media is unavailable", 410, false);
  }
  const type = claim.schedule.media?.mediaType ?? "TEXT";
  const result = await enqueueMessage({
    actor: claim.schedule.session.user,
    operation: "schedule.execute",
    idempotencyKey: claim.execution.id,
    sessionPublicId: claim.schedule.session.sessionId,
    recipient: claim.schedule.jid,
    type,
    text: claim.schedule.content ?? undefined,
    caption: claim.schedule.media ? claim.schedule.content ?? undefined : undefined,
    mediaId: claim.schedule.media?.id,
  });
  const enqueuedAt = new Date();
  await prisma.scheduleExecution.updateMany({
    where: { id: claim.execution.id, status: "CLAIMED", claimToken: claim.claimToken },
    data: { status: "ENQUEUED", messageJobId: result.job.id, enqueuedAt, finishedAt: enqueuedAt, safeErrorCode: null, safeErrorMessage: null },
  });
  return { action: "ENQUEUED" as const, finalized: await finalizeSchedule(claim, {}) };
}

export async function failClaimedSchedule(claim: ClaimedSchedule, error: unknown) {
  const known = error instanceof MessageJobError ? error : null;
  const retryable = known?.retryable ?? !(error instanceof Error && ["QuotaExceededError", "EntitlementDeniedError", "SubscriptionInactiveError"].includes(error.name));
  const code = known?.code ?? (retryable ? "TEMPORARY_SCHEDULER_ERROR" : "SCHEDULE_EXECUTION_DENIED");
  const message = known?.message ?? (retryable ? "Temporary scheduler failure" : "Schedule execution is not allowed");
  const now = new Date();
  if (retryable) {
    await prisma.$transaction([
      prisma.scheduleExecution.updateMany({ where: { id: claim.execution.id, status: "CLAIMED", claimToken: claim.claimToken }, data: { safeErrorCode: code, safeErrorMessage: message } }),
      prisma.scheduledMessage.updateMany({
        where: { id: claim.schedule.id, status: "ACTIVE", lockedBy: claim.claimToken },
        data: { lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, safeErrorCode: code, safeErrorMessage: message },
      }),
    ]);
    return { retrying: true, code };
  }
  await prisma.$transaction(async (tx) => {
    await tx.scheduleExecution.updateMany({ where: { id: claim.execution.id, status: "CLAIMED", claimToken: claim.claimToken }, data: { status: "FAILED", safeErrorCode: code, safeErrorMessage: message, finishedAt: now } });
    const changed = await tx.scheduledMessage.updateMany({
      where: { id: claim.schedule.id, status: "ACTIVE", lockedBy: claim.claimToken },
      data: { status: "FAILED", lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, safeErrorCode: code, safeErrorMessage: message },
    });
    if (changed.count === 1) {
      await createWebhookOutboxEvent(tx, {
        tenantId: claim.schedule.session.user.id,
        sessionDbId: claim.schedule.sessionId,
        sessionPublicId: claim.schedule.session.sessionId,
        eventType: "schedule.status",
        eventKey: `schedule:${claim.schedule.id}:${claim.execution.id}:FAILED`,
        data: { scheduleId: claim.schedule.id, executionId: claim.execution.id, status: "FAILED", errorCode: code },
        now,
      });
    }
  });
  return { retrying: false, code };
}

export async function recoverSchedulesForWorker(workerId: string) {
  const result = await prisma.scheduledMessage.updateMany({
    where: { status: "ACTIVE", lockedBy: { startsWith: `${workerId}:` } },
    data: { lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, safeErrorCode: "SCHEDULER_SHUTDOWN", safeErrorMessage: "Scheduler stopped before occurrence finalization" },
  });
  return result.count;
}
