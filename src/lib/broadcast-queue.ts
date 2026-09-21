import crypto from "node:crypto";
import { Prisma, type BroadcastLog, type BroadcastRecipient, type MessageJobType } from "@prisma/client";
import { requireEntitlement } from "./billing";
import { deterministicBroadcastDelay } from "./broadcast-policy";
import { MessageJobError } from "./message-job-errors";
import { enqueueMessage } from "./message-job-service";
import { prisma } from "./prisma";
import { renderBroadcastTemplate, type BroadcastVariables } from "./broadcast-template";
import { createWebhookOutboxEvent } from "./webhook-outbox";

export const DEFAULT_BROADCAST_LEASE_MS = 30_000;

type BroadcastWithRuntime = BroadcastLog & {
  session: { id: string; sessionId: string } | null;
  creator: { id: string; role: "SUPERADMIN" | "USER"; ownerId: string | null } | null;
  media: { id: string; mediaType: MessageJobType; status: "ACTIVE" | "DELETED" | "QUARANTINED" } | null;
};

export type ClaimedBroadcast = {
  broadcast: BroadcastWithRuntime;
  claimToken: string;
  leaseMs: number;
};

export async function claimNextDueBroadcast(workerId: string, leaseMs = DEFAULT_BROADCAST_LEASE_MS): Promise<ClaimedBroadcast | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE BroadcastLog AS broadcastRow
    INNER JOIN (
      SELECT candidate.id
      FROM (
        SELECT id
        FROM BroadcastLog
        WHERE status IN ('QUEUED', 'RUNNING')
          AND nextDispatchAt <= ${now}
          AND (lockedBy IS NULL OR leaseExpiresAt < ${now})
        ORDER BY nextDispatchAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = broadcastRow.id
    SET
      broadcastRow.status = 'RUNNING',
      broadcastRow.lockedBy = ${claimToken},
      broadcastRow.leaseExpiresAt = ${leaseExpiresAt},
      broadcastRow.heartbeatAt = ${now},
      broadcastRow.updatedAt = ${now}
    WHERE broadcastRow.status IN ('QUEUED', 'RUNNING')
      AND broadcastRow.nextDispatchAt <= ${now}
      AND (broadcastRow.lockedBy IS NULL OR broadcastRow.leaseExpiresAt < ${now})
  `);
  if (claimed !== 1) return null;

  const broadcast = await prisma.broadcastLog.findFirst({
    where: { lockedBy: claimToken, status: "RUNNING" },
    include: {
      session: { select: { id: true, sessionId: true } },
      creator: { select: { id: true, role: true, ownerId: true } },
      media: { select: { id: true, mediaType: true, status: true } },
    },
  }) as BroadcastWithRuntime | null;
  if (!broadcast) return null;
  return { broadcast, claimToken, leaseMs };
}

export function heartbeatBroadcast(broadcastId: string, claimToken: string, leaseMs = DEFAULT_BROADCAST_LEASE_MS) {
  const now = new Date();
  return prisma.broadcastLog.updateMany({
    where: { id: broadcastId, status: "RUNNING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

async function finalizeRecipient(
  claim: ClaimedBroadcast,
  recipient: BroadcastRecipient,
  input: {
    status: "ENQUEUED" | "SKIPPED" | "FAILED";
    messageJobId?: string;
    renderedMessage?: string;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const ownership = await tx.broadcastLog.updateMany({
      where: { id: claim.broadcast.id, status: "RUNNING", lockedBy: claim.claimToken },
      data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + claim.leaseMs) },
    });
    if (ownership.count !== 1) return false;
    const recipientUpdate = await tx.broadcastRecipient.updateMany({
      where: { id: recipient.id, broadcastLogId: claim.broadcast.id, status: "PENDING" },
      data: {
        status: input.status,
        messageJobId: input.messageJobId,
        renderedMessage: input.renderedMessage,
        attempt: { increment: 1 },
        safeErrorCode: input.errorCode ?? null,
        safeErrorMessage: input.errorMessage ?? null,
        enqueuedAt: input.status === "ENQUEUED" ? now : null,
        skippedAt: input.status === "SKIPPED" ? now : null,
        failedAt: input.status === "FAILED" ? now : null,
      },
    });
    if (recipientUpdate.count !== 1) throw new Error("Broadcast recipient state changed during finalization");
    const pending = await tx.broadcastRecipient.count({ where: { broadcastLogId: claim.broadcast.id, status: "PENDING" } });
    const completed = pending === 0;
    const aggregate = await tx.broadcastLog.updateMany({
      where: { id: claim.broadcast.id, status: "RUNNING", lockedBy: claim.claimToken },
      data: {
        status: completed ? "COMPLETED" : "RUNNING",
        ...(input.status === "ENQUEUED" ? { enqueued: { increment: 1 } } : {}),
        ...(input.status === "SKIPPED" ? { skipped: { increment: 1 } } : {}),
        ...(input.status === "FAILED" ? { failed: { increment: 1 } } : {}),
        nextDispatchAt: completed
          ? now
          : new Date(now.getTime() + deterministicBroadcastDelay(
            claim.broadcast.jitterSeed,
            recipient.position,
            claim.broadcast.delayMinMs,
            claim.broadcast.delayMaxMs,
          )),
        completedAt: completed ? now : null,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: null,
        safeErrorMessage: null,
      },
    });
    if (aggregate.count !== 1) throw new Error("Broadcast ownership was lost during finalization");
    if (completed && claim.broadcast.tenantId) {
      await createWebhookOutboxEvent(tx, {
        tenantId: claim.broadcast.tenantId,
        sessionDbId: claim.broadcast.sessionDbId,
        sessionPublicId: claim.broadcast.session?.sessionId ?? null,
        eventType: "broadcast.status",
        eventKey: `broadcast:${claim.broadcast.id}:COMPLETED`,
        data: { broadcastId: claim.broadcast.id, status: "COMPLETED" },
        now,
      });
    }
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function lateSuppressionReason(claim: ClaimedBroadcast, recipient: BroadcastRecipient) {
  if (!claim.broadcast.tenantId) return null;
  const suppression = await prisma.suppressionEntry.findFirst({
    where: { tenantId: claim.broadcast.tenantId, jid: recipient.jid, removedAt: null },
    select: { reason: true },
  });
  if (suppression) return suppression.reason === "UNSUBSCRIBE"
    ? { code: "RECIPIENT_UNSUBSCRIBED", message: "Recipient unsubscribed before enqueue" }
    : { code: "RECIPIENT_SUPPRESSED", message: "Recipient is on the suppression list" };
  if (claim.broadcast.requireOptIn && claim.broadcast.sessionDbId) {
    const consent = await prisma.contact.findFirst({
      where: { sessionId: claim.broadcast.sessionDbId, jid: recipient.jid, consentStatus: "OPTED_IN" },
      select: { id: true },
    });
    if (!consent) return { code: "OPT_IN_REQUIRED", message: "Recipient has not opted in" };
  }
  return null;
}

export async function executeClaimedBroadcast(claim: ClaimedBroadcast) {
  const ownership = await heartbeatBroadcast(claim.broadcast.id, claim.claimToken, claim.leaseMs);
  if (ownership.count !== 1) return { action: "CLAIM_LOST" as const, finalized: false };
  const recipient = await prisma.broadcastRecipient.findFirst({
    where: { broadcastLogId: claim.broadcast.id, status: "PENDING" },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  if (!recipient) {
    const now = new Date();
    const completed = await prisma.$transaction(async (tx) => {
      const changed = await tx.broadcastLog.updateMany({
        where: { id: claim.broadcast.id, status: "RUNNING", lockedBy: claim.claimToken },
        data: { status: "COMPLETED", completedAt: now, nextDispatchAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
      });
      if (changed.count === 1 && claim.broadcast.tenantId) {
        await createWebhookOutboxEvent(tx, {
          tenantId: claim.broadcast.tenantId,
          sessionDbId: claim.broadcast.sessionDbId,
          sessionPublicId: claim.broadcast.session?.sessionId ?? null,
          eventType: "broadcast.status",
          eventKey: `broadcast:${claim.broadcast.id}:COMPLETED`,
          data: { broadcastId: claim.broadcast.id, status: "COMPLETED" },
          now,
        });
      }
      return changed;
    });
    return { action: "COMPLETED" as const, finalized: completed.count === 1 };
  }

  const suppression = await lateSuppressionReason(claim, recipient);
  if (suppression) {
    return {
      action: "SKIPPED" as const,
      finalized: await finalizeRecipient(claim, recipient, { status: "SKIPPED", errorCode: suppression.code, errorMessage: suppression.message }),
    };
  }
  if (!claim.broadcast.creator || !claim.broadcast.session) {
    throw new MessageJobError("BROADCAST_LEGACY_INCOMPLETE", "Broadcast is missing its creator or device", 409, false);
  }
  await requireEntitlement(claim.broadcast.creator.id, claim.broadcast.campaignId ? "CAMPAIGNS_MONTHLY" : "BROADCASTS_MONTHLY");
  if (claim.broadcast.media && claim.broadcast.media.status !== "ACTIVE") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "Broadcast media is unavailable", 410, false);
  }
  const recipientVariables = recipient.variables && typeof recipient.variables === "object" && !Array.isArray(recipient.variables)
    ? recipient.variables as BroadcastVariables
    : {};
  const renderedMessage = renderBroadcastTemplate(claim.broadcast.message, claim.broadcast.jitterSeed, recipient.id, recipientVariables);
  const stillOwned = await heartbeatBroadcast(claim.broadcast.id, claim.claimToken, claim.leaseMs);
  if (stillOwned.count !== 1) return { action: "CLAIM_LOST" as const, finalized: false };
  const type = claim.broadcast.media?.mediaType ?? "TEXT";
  const result = await enqueueMessage({
    actor: claim.broadcast.creator,
    operation: "broadcast.execute",
    idempotencyKey: recipient.id,
    sessionPublicId: claim.broadcast.session.sessionId,
    recipient: recipient.jid,
    type,
    text: type === "TEXT" ? renderedMessage : undefined,
    caption: type === "TEXT" ? undefined : renderedMessage,
    mediaId: claim.broadcast.media?.id,
  });
  return {
    action: "ENQUEUED" as const,
    idempotent: result.idempotent,
    finalized: await finalizeRecipient(claim, recipient, {
      status: "ENQUEUED",
      messageJobId: result.job.id,
      renderedMessage,
    }),
  };
}

export async function failClaimedBroadcast(claim: ClaimedBroadcast, error: unknown) {
  const known = error instanceof MessageJobError ? error : null;
  const explicitlyDenied = error instanceof Error && ["QuotaExceededError", "EntitlementDeniedError", "SubscriptionInactiveError"].includes(error.name);
  const retryable = known?.retryable ?? !explicitlyDenied;
  const code = known?.code ?? (retryable ? "TEMPORARY_BROADCAST_ERROR" : "BROADCAST_EXECUTION_DENIED");
  const message = known?.message ?? (retryable ? "Temporary broadcast worker failure" : "Broadcast execution is not allowed");
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.broadcastLog.updateMany({
      where: { id: claim.broadcast.id, status: "RUNNING", lockedBy: claim.claimToken },
      data: retryable ? {
        status: "QUEUED",
        nextDispatchAt: new Date(now.getTime() + 5_000),
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: code,
        safeErrorMessage: message,
      }
      : {
        status: "FAILED",
        failedAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        safeErrorCode: code,
        safeErrorMessage: message,
      },
    });
    if (!retryable && changed.count === 1 && claim.broadcast.tenantId) {
      await createWebhookOutboxEvent(tx, {
        tenantId: claim.broadcast.tenantId,
        sessionDbId: claim.broadcast.sessionDbId,
        sessionPublicId: claim.broadcast.session?.sessionId ?? null,
        eventType: "broadcast.status",
        eventKey: `broadcast:${claim.broadcast.id}:FAILED`,
        data: { broadcastId: claim.broadcast.id, status: "FAILED", errorCode: code },
        now,
      });
    }
    return changed;
  });
  return { retrying: retryable, code, updated: updated.count === 1 };
}

export async function recoverBroadcastsForWorker(workerId: string) {
  const result = await prisma.broadcastLog.updateMany({
    where: { status: "RUNNING", lockedBy: { startsWith: `${workerId}:` } },
    data: {
      status: "QUEUED",
      nextDispatchAt: new Date(),
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      safeErrorCode: "BROADCAST_WORKER_SHUTDOWN",
      safeErrorMessage: "Broadcast worker stopped before recipient finalization",
    },
  });
  return result.count;
}
