import crypto from "node:crypto";
import { MessageJobStatus, Prisma, type MessageDeliveryEventType } from "@prisma/client";
import { classifyMessageDispatchError } from "./message-job-errors";
import { settleMessageQuota } from "./message-job-service";
import { calculateMessageRetryDelay } from "./message-queue-policy";
import { prisma } from "./prisma";
import { createWebhookOutboxEvent } from "./webhook-outbox";

export const DEFAULT_MESSAGE_LEASE_MS = 30_000;

export type ClaimedMessageJob = NonNullable<Awaited<ReturnType<typeof claimNextMessageJob>>>;

export async function claimNextMessageJob(workerId: string, leaseMs = DEFAULT_MESSAGE_LEASE_MS) {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");

  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimToken = `${workerId}:${crypto.randomUUID()}`;

  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE MessageJob AS job
    INNER JOIN (
      SELECT candidate.id
      FROM (
        SELECT id
        FROM MessageJob
        WHERE
          (status = 'QUEUED' AND availableAt <= ${now})
          OR (status = 'PROCESSING' AND leaseExpiresAt < ${now})
        ORDER BY priority DESC, availableAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = job.id
    SET
      job.status = 'PROCESSING',
      job.lockedBy = ${claimToken},
      job.leaseExpiresAt = ${leaseExpiresAt},
      job.heartbeatAt = ${now},
      job.attempts = job.attempts + 1,
      job.updatedAt = ${now}
    WHERE
      (job.status = 'QUEUED' AND job.availableAt <= ${now})
      OR (job.status = 'PROCESSING' AND job.leaseExpiresAt < ${now})
  `);

  if (claimed !== 1) return null;
  const job = await prisma.messageJob.findFirst({
    where: { lockedBy: claimToken, status: "PROCESSING" },
    include: { session: true, media: true },
  });
  if (!job) return null;

  await prisma.messageJobAttempt.upsert({
    where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attempts } },
    create: { jobId: job.id, attemptNumber: job.attempts, workerId: claimToken },
    update: { workerId: claimToken, status: "PROCESSING", safeErrorCode: null, safeErrorMessage: null, finishedAt: null },
  });
  return { ...job, claimToken };
}

export async function heartbeatMessageJob(jobId: string, claimToken: string, leaseMs = DEFAULT_MESSAGE_LEASE_MS) {
  const now = new Date();
  return prisma.messageJob.updateMany({
    where: { id: jobId, status: "PROCESSING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

export async function completeMessageJob(job: ClaimedMessageJob, whatsappMessageId: string) {
  const owned = await prisma.messageJob.findFirst({
    where: { id: job.id, status: "PROCESSING", lockedBy: job.claimToken },
    select: { id: true },
  });
  if (!owned) return false;

  await settleMessageQuota(job, "COMMIT");
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.messageJob.updateMany({
      where: { id: job.id, status: "PROCESSING", lockedBy: job.claimToken },
      data: {
        status: "SENT",
        whatsappMessageId,
        sentAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: null,
        safeErrorMessage: null,
        lastErrorAt: null,
      },
    });
    if (updated.count === 0) return false;
    await tx.broadcastRecipient.updateMany({
      where: { messageJobId: job.id, status: "ENQUEUED" },
      data: { status: "SENT", sentAt: now, safeErrorCode: null, safeErrorMessage: null },
    });
    await tx.messageJobAttempt.update({
      where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attempts } },
      data: { status: "SUCCEEDED", finishedAt: now },
    });
    await tx.messageDeliveryEvent.upsert({
      where: { jobId_type_whatsappMessageId: { jobId: job.id, type: "SENT", whatsappMessageId } },
      create: { jobId: job.id, type: "SENT", whatsappMessageId, occurredAt: now },
      update: {},
    });
    await createWebhookOutboxEvent(tx, {
      tenantId: job.tenantId,
      sessionDbId: job.sessionId,
      sessionPublicId: job.session.sessionId,
      eventType: "message.sent",
      eventKey: `message-job:${job.id}:SENT`,
      data: { jobId: job.id, messageId: whatsappMessageId, recipient: job.recipient, status: "SENT" },
      now,
    });
    return true;
  });
  return result;
}

export async function failMessageJob(job: ClaimedMessageJob, error: unknown) {
  const safeError = classifyMessageDispatchError(error);
  const now = new Date();
  const shouldRetry = safeError.retryable && job.attempts < job.maxAttempts;
  const owned = await prisma.messageJob.findFirst({
    where: { id: job.id, status: "PROCESSING", lockedBy: job.claimToken },
    select: { id: true },
  });
  if (!owned) return { updated: false, retrying: false, error: safeError };

  if (!shouldRetry) await settleMessageQuota(job, "RELEASE");
  const availableAt = shouldRetry ? new Date(now.getTime() + calculateMessageRetryDelay(job.attempts)) : now;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.messageJob.updateMany({
      where: { id: job.id, status: "PROCESSING", lockedBy: job.claimToken },
      data: {
        status: shouldRetry ? "QUEUED" : "FAILED",
        availableAt,
        failedAt: shouldRetry ? null : now,
        deadLetteredAt: shouldRetry ? null : now,
        safeErrorCode: safeError.code,
        safeErrorMessage: safeError.message,
        lastErrorAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (updated.count === 0) return false;
    if (!shouldRetry) {
      await tx.broadcastRecipient.updateMany({
        where: { messageJobId: job.id, status: { in: ["ENQUEUED", "SENT"] } },
        data: { status: "FAILED", failedAt: now, safeErrorCode: safeError.code, safeErrorMessage: safeError.message },
      });
    }
    await tx.messageJobAttempt.update({
      where: { jobId_attemptNumber: { jobId: job.id, attemptNumber: job.attempts } },
      data: {
        status: "FAILED",
        safeErrorCode: safeError.code,
        safeErrorMessage: safeError.message,
        finishedAt: now,
      },
    });
    if (!shouldRetry && job.whatsappMessageId) {
      await tx.messageDeliveryEvent.upsert({
        where: {
          jobId_type_whatsappMessageId: {
            jobId: job.id,
            type: "FAILED",
            whatsappMessageId: job.whatsappMessageId,
          },
        },
        create: { jobId: job.id, type: "FAILED", whatsappMessageId: job.whatsappMessageId, occurredAt: now },
        update: {},
      });
    }
    if (!shouldRetry) {
      await createWebhookOutboxEvent(tx, {
        tenantId: job.tenantId,
        sessionDbId: job.sessionId,
        sessionPublicId: job.session.sessionId,
        eventType: "message.status",
        eventKey: `message-job:${job.id}:FAILED`,
        data: { jobId: job.id, messageId: job.whatsappMessageId, recipient: job.recipient, status: "FAILED", errorCode: safeError.code },
        now,
      });
    }
    return true;
  });
  return { updated: result, retrying: result && shouldRetry, error: safeError, availableAt };
}

export async function recoverMessageJobsForWorker(workerId: string) {
  const claims = await prisma.messageJob.findMany({
    where: { status: "PROCESSING", lockedBy: { startsWith: `${workerId}:` } },
    select: { id: true, attempts: true },
  });
  if (claims.length === 0) return 0;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const job of claims) {
      await tx.messageJobAttempt.updateMany({
        where: { jobId: job.id, attemptNumber: job.attempts, status: "PROCESSING" },
        data: {
          status: "FAILED",
          safeErrorCode: "WORKER_SHUTDOWN",
          safeErrorMessage: "Worker stopped before delivery completed",
          finishedAt: now,
        },
      });
    }
    const updated = await tx.messageJob.updateMany({
      where: { id: { in: claims.map((job) => job.id) }, status: "PROCESSING", lockedBy: { startsWith: `${workerId}:` } },
      data: {
        status: "QUEUED",
        availableAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: "WORKER_SHUTDOWN",
        safeErrorMessage: "Worker stopped before delivery completed",
        lastErrorAt: now,
      },
    });
  });
  return claims.length;
}

const deliveryProgress: Record<MessageJobStatus, number> = {
  QUEUED: 0,
  PROCESSING: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: -1,
  CANCELLED: -1,
};

export async function recordMessageDeliveryStatus(
  whatsappMessageId: string,
  type: Extract<MessageDeliveryEventType, "SENT" | "DELIVERED" | "READ">,
  payload?: Prisma.InputJsonValue,
) {
  const job = await prisma.messageJob.findUnique({ where: { whatsappMessageId }, include: { session: { select: { sessionId: true } } } });
  if (type === "SENT" && (job?.status === "QUEUED" || job?.status === "PROCESSING")) return false;
  if (!job || deliveryProgress[job.status] < 0 || deliveryProgress[type] <= deliveryProgress[job.status]) return false;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.messageJob.updateMany({
      where: {
        id: job.id,
        status: type === "SENT" ? { in: ["QUEUED", "PROCESSING"] } : type === "DELIVERED" ? { in: ["SENT"] } : { in: ["SENT", "DELIVERED"] },
      },
      data: {
        status: type,
        ...(type === "SENT" ? { sentAt: now } : {}),
        ...(type === "DELIVERED" ? { deliveredAt: now } : {}),
        ...(type === "READ" ? { deliveredAt: job.deliveredAt ?? now, readAt: now } : {}),
      },
    });
    if (updated.count === 0) return;
    await tx.broadcastRecipient.updateMany({
      where: { messageJobId: job.id, status: { in: type === "SENT" ? ["ENQUEUED"] : type === "DELIVERED" ? ["SENT"] : ["SENT", "DELIVERED"] } },
      data: {
        status: type,
        ...(type === "SENT" ? { sentAt: now } : {}),
      },
    });
    await tx.messageDeliveryEvent.upsert({
      where: { jobId_type_whatsappMessageId: { jobId: job.id, type, whatsappMessageId } },
      create: { jobId: job.id, type, whatsappMessageId, occurredAt: now, payload },
      update: {},
    });
    await createWebhookOutboxEvent(tx, {
      tenantId: job.tenantId,
      sessionDbId: job.sessionId,
      sessionPublicId: job.session.sessionId,
      eventType: "message.status",
      eventKey: `message-job:${job.id}:${type}`,
      data: { jobId: job.id, messageId: whatsappMessageId, recipient: job.recipient, status: type, payload: payload ?? null },
      now,
    });
  });
  return true;
}
