import crypto from "node:crypto";
import { Prisma, type BroadcastStatus, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { resolveTenantId, requireEntitlement } from "./billing";
import { prepareRecipientDataSnapshots } from "./broadcast-policy";
import { validateBroadcastPackageLimits } from "./package-policy";
import { hashCanonicalJson } from "./canonical-json";
import { IdempotencyConflictError } from "./message-job-service";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { validateBroadcastTemplate } from "./broadcast-template";
import { commitReservedUsage, releaseReservedUsage, reserveUsage } from "./usage";

export type BroadcastActor = {
  id: string;
  role: Role;
  ownerId?: string | null;
  apiKeyId?: string;
};

export type BroadcastCreateInput = {
  sessionId: string;
  name?: string;
  recipients?: string[];
  recipientData?: Array<{ recipient: string; variables?: Record<string, string> }>;
  message: string;
  mediaId?: string;
  delayMinMs: number;
  delayMaxMs: number;
  requireOptIn: boolean;
};

const broadcastInclude = {
  recipients: {
    orderBy: { position: "asc" as const },
    take: 100,
    include: {
      messageJob: {
        select: {
          id: true,
          status: true,
          safeErrorCode: true,
          safeErrorMessage: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
        },
      },
    },
  },
} satisfies Prisma.BroadcastLogInclude;

type BroadcastWithRecipients = Prisma.BroadcastLogGetPayload<{ include: typeof broadcastInclude }>;

export function serializeBroadcast(broadcast: BroadcastWithRecipients) {
  const completed = broadcast.enqueued + broadcast.failed + broadcast.skipped + broadcast.cancelled;
  return {
    id: broadcast.id,
    sessionId: broadcast.sessionId,
    name: broadcast.name,
    message: broadcast.message,
    mediaId: broadcast.mediaId,
    mediaType: broadcast.mediaType,
    status: broadcast.status,
    progress: {
      total: broadcast.total,
      enqueued: broadcast.enqueued,
      failed: broadcast.failed,
      skipped: broadcast.skipped,
      cancelled: broadcast.cancelled,
      pending: Math.max(0, broadcast.total - completed),
      percent: broadcast.total === 0 ? 100 : Math.min(100, Math.round((completed / broadcast.total) * 100)),
    },
    delayMinMs: broadcast.delayMinMs,
    delayMaxMs: broadcast.delayMaxMs,
    requireOptIn: broadcast.requireOptIn,
    error: broadcast.safeErrorCode
      ? { code: broadcast.safeErrorCode, message: broadcast.safeErrorMessage }
      : null,
    startedAt: broadcast.startedAt,
    pausedAt: broadcast.pausedAt,
    completedAt: broadcast.completedAt,
    cancelledAt: broadcast.cancelledAt,
    failedAt: broadcast.failedAt,
    createdAt: broadcast.createdAt,
    updatedAt: broadcast.updatedAt,
    recipients: broadcast.recipients.map((recipient) => ({
      id: recipient.id,
      position: recipient.position,
      recipient: recipient.jid,
      status: recipient.messageJob?.status ?? recipient.status,
      snapshotStatus: recipient.status,
      renderedMessage: recipient.renderedMessage,
      messageJob: recipient.messageJob,
      error: recipient.safeErrorCode
        ? { code: recipient.safeErrorCode, message: recipient.safeErrorMessage }
        : recipient.messageJob?.safeErrorCode
          ? { code: recipient.messageJob.safeErrorCode, message: recipient.messageJob.safeErrorMessage }
          : null,
      enqueuedAt: recipient.enqueuedAt,
      skippedAt: recipient.skippedAt,
      failedAt: recipient.failedAt,
    })),
    recipientPageLimited: broadcast.total > broadcast.recipients.length,
  };
}

async function resolveBroadcastSession(actor: BroadcastActor, sessionPublicId: string) {
  const allowed = await canAccessSession(actor.id, actor.role, sessionPublicId);
  if (!allowed) throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  const session = await prisma.session.findUnique({
    where: { sessionId: sessionPublicId },
    select: { id: true, sessionId: true, userId: true },
  });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  return session;
}

async function actorTenant(actor: BroadcastActor) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  return tenantId;
}

function visibleTenantWhere(actor: BroadcastActor, tenantId: string) {
  return actor.role === "SUPERADMIN" ? {} : { tenantId };
}

async function findExistingBroadcast(tenantId: string, createKey: string) {
  return prisma.broadcastLog.findUnique({
    where: { tenantId_createKey: { tenantId, createKey } },
    include: broadcastInclude,
  });
}

export async function createBroadcast(actor: BroadcastActor, input: BroadcastCreateInput, createKey: string) {
  if (!createKey.trim() || createKey.length > 191) {
    throw new MessageJobError("INVALID_IDEMPOTENCY_KEY", "A valid Idempotency-Key header is required", 400, false);
  }
  const session = await resolveBroadcastSession(actor, input.sessionId);
  const tenantId = await actorTenant(actor);
  const template = validateBroadcastTemplate(input.message);
  const requiredVariables = template.variables;
  const recipientInputs = input.recipientData ?? input.recipients?.map((recipient) => ({ recipient })) ?? [];
  const snapshots = prepareRecipientDataSnapshots(recipientInputs).map((snapshot) => {
    if (requiredVariables.length === 0) return { ...snapshot, variables: undefined };
    const sourceVariables = snapshot.variables ?? {};
    const variables = Object.fromEntries(requiredVariables
      .filter((name) => Object.prototype.hasOwnProperty.call(sourceVariables, name))
      .map((name) => [name, sourceVariables[name]]));
    return { ...snapshot, variables };
  });
  const [batchEntitlement, delayEntitlement] = await Promise.all([
    requireEntitlement(actor.id, "BROADCAST_RECIPIENTS_PER_BATCH"),
    requireEntitlement(actor.id, "BROADCAST_MIN_DELAY_MS"),
  ]);
  const packageViolation = validateBroadcastPackageLimits(
    { recipientCount: snapshots.length, delayMinMs: input.delayMinMs },
    { recipientLimit: batchEntitlement.limit, minimumDelayMs: delayEntitlement.limit },
  );
  if (packageViolation) {
    throw new MessageJobError(packageViolation.code, packageViolation.message, 422, false);
  }
  const uniqueJids = snapshots.map((snapshot) => snapshot.jid);

  let media: { id: string; mediaType: string } | null = null;
  if (input.mediaId) {
    media = await prisma.privateMedia.findFirst({
      where: { id: input.mediaId, tenantId, status: "ACTIVE" },
      select: { id: true, mediaType: true },
    });
    if (!media || media.mediaType === "TEXT") {
      throw new MessageJobError("MEDIA_NOT_FOUND", "Compatible private media was not found", 404, false);
    }
  }

  const [suppressions, optedInContacts] = await Promise.all([
    prisma.suppressionEntry.findMany({
      where: { tenantId, jid: { in: uniqueJids }, removedAt: null },
      select: { jid: true },
    }),
    input.requireOptIn
      ? prisma.contact.findMany({
        where: { sessionId: session.id, jid: { in: uniqueJids }, consentStatus: "OPTED_IN" },
        select: { jid: true },
      })
      : Promise.resolve([]),
  ]);
  const suppressed = new Set(suppressions.map((entry) => entry.jid));
  const optedIn = new Set(optedInContacts.map((contact) => contact.jid));
  const finalSnapshots = snapshots.map((snapshot) => {
    if (snapshot.status === "SKIPPED") return snapshot;
    if (suppressed.has(snapshot.jid)) {
      return { ...snapshot, status: "SKIPPED" as const, safeErrorCode: "RECIPIENT_SUPPRESSED", safeErrorMessage: "Recipient is on the suppression list" };
    }
    if (input.requireOptIn && !optedIn.has(snapshot.jid)) {
      return { ...snapshot, status: "SKIPPED" as const, safeErrorCode: "OPT_IN_REQUIRED", safeErrorMessage: "Recipient has not opted in" };
    }
    return snapshot;
  });
  for (const snapshot of finalSnapshots) {
    if (snapshot.status !== "PENDING") continue;
    const variables = snapshot.variables ?? {};
    const missing = requiredVariables.filter((name) => !Object.prototype.hasOwnProperty.call(variables, name));
    if (missing.length > 0) {
      throw new MessageJobError(
        "MISSING_BROADCAST_VARIABLE",
        `Recipient ${snapshot.position + 1} is missing variable(s): ${missing.map((name) => `{{${name}}}`).join(", ")}`,
        422,
        false,
      );
    }
  }
  const skipped = finalSnapshots.filter((snapshot) => snapshot.status === "SKIPPED").length;
  const requestHash = input.recipientData
    ? hashCanonicalJson({
      sessionId: session.sessionId,
      name: input.name?.trim() || null,
      recipientData: finalSnapshots.map((snapshot) => ({ jid: snapshot.jid, variables: snapshot.variables ?? {} })),
      message: template.source,
      mediaId: media?.id ?? null,
      delayMinMs: input.delayMinMs,
      delayMaxMs: input.delayMaxMs,
      requireOptIn: input.requireOptIn,
    })
    : hashCanonicalJson({
      // Preserve the pre-personalization hash contract for existing API clients and retry keys.
      sessionId: session.sessionId,
      name: input.name?.trim() || null,
      recipients: finalSnapshots.map((snapshot) => snapshot.jid),
      message: template.source,
      mediaId: media?.id ?? null,
      delayMinMs: input.delayMinMs,
      delayMaxMs: input.delayMaxMs,
      requireOptIn: input.requireOptIn,
    });
  const existing = await findExistingBroadcast(tenantId, createKey);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
    await commitReservedUsage({ userId: actor.id, feature: "BROADCASTS_MONTHLY", idempotencyKey: `broadcast:${createKey}` });
    return { broadcast: serializeBroadcast(existing), idempotent: true };
  }

  const quotaKey = `broadcast:${createKey}`;
  await reserveUsage({
    userId: actor.id,
    feature: "BROADCASTS_MONTHLY",
    amount: BigInt(1),
    idempotencyKey: quotaKey,
    apiKeyId: actor.apiKeyId,
    meta: { sessionId: session.sessionId },
  });

  let recordCreated = false;
  try {
    const broadcast = await prisma.broadcastLog.create({
      data: {
        tenantId,
        createdById: actor.id,
        sessionDbId: session.id,
        sessionId: session.sessionId,
        createKey,
        requestHash,
        name: input.name?.trim() || null,
        message: template.source,
        mediaId: media?.id,
        mediaType: media?.mediaType,
        total: finalSnapshots.length,
        skipped,
        status: skipped === finalSnapshots.length ? "COMPLETED" : "QUEUED",
        delayMinMs: input.delayMinMs,
        delayMaxMs: input.delayMaxMs,
        jitterSeed: crypto.randomBytes(24).toString("hex"),
        requireOptIn: input.requireOptIn,
        completedAt: skipped === finalSnapshots.length ? new Date() : null,
        recipients: {
          create: finalSnapshots.map((snapshot) => ({
            position: snapshot.position,
            jid: snapshot.jid,
            variables: snapshot.variables && Object.keys(snapshot.variables).length > 0 ? snapshot.variables : undefined,
            status: snapshot.status,
            safeErrorCode: snapshot.safeErrorCode,
            safeErrorMessage: snapshot.safeErrorMessage,
            skippedAt: snapshot.status === "SKIPPED" ? new Date() : null,
          })),
        },
      },
      include: broadcastInclude,
    });
    recordCreated = true;
    await commitReservedUsage({ userId: actor.id, feature: "BROADCASTS_MONTHLY", idempotencyKey: quotaKey });
    return { broadcast: serializeBroadcast(broadcast), idempotent: false };
  } catch (error) {
    // Keep the reservation recoverable when only the post-create settlement failed.
    if (recordCreated) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await findExistingBroadcast(tenantId, createKey);
      if (raced) {
        if (raced.requestHash !== requestHash) throw new IdempotencyConflictError();
        await commitReservedUsage({ userId: actor.id, feature: "BROADCASTS_MONTHLY", idempotencyKey: quotaKey });
        return { broadcast: serializeBroadcast(raced), idempotent: true };
      }
    }
    await releaseReservedUsage({ userId: actor.id, feature: "BROADCASTS_MONTHLY", idempotencyKey: quotaKey }).catch(() => undefined);
    throw error;
  }
}

export async function listBroadcasts(actor: BroadcastActor, input: { sessionId?: string; status?: BroadcastStatus; limit?: number }) {
  const tenantId = await actorTenant(actor);
  let sessionDbId: string | undefined;
  if (input.sessionId) sessionDbId = (await resolveBroadcastSession(actor, input.sessionId)).id;
  const limit = Number.isInteger(input.limit) ? Math.min(100, Math.max(1, input.limit!)) : 25;
  const broadcasts = await prisma.broadcastLog.findMany({
    where: { ...visibleTenantWhere(actor, tenantId), ...(sessionDbId ? { sessionDbId } : {}), ...(input.status ? { status: input.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: broadcastInclude,
  });
  return broadcasts.map(serializeBroadcast);
}

export async function getBroadcast(actor: BroadcastActor, broadcastId: string) {
  const tenantId = await actorTenant(actor);
  const broadcast = await prisma.broadcastLog.findFirst({
    where: { id: broadcastId, ...visibleTenantWhere(actor, tenantId) },
    include: broadcastInclude,
  });
  if (!broadcast) throw new MessageJobError("BROADCAST_NOT_FOUND", "Broadcast was not found", 404, false);
  return serializeBroadcast(broadcast);
}

async function changeBroadcastState(
  actor: BroadcastActor,
  broadcastId: string,
  from: BroadcastStatus[],
  data: Prisma.BroadcastLogUpdateManyMutationInput,
  errorMessage: string,
) {
  const tenantId = await actorTenant(actor);
  const result = await prisma.broadcastLog.updateMany({
    where: { id: broadcastId, ...visibleTenantWhere(actor, tenantId), status: { in: from } },
    data,
  });
  if (result.count === 0) {
    const exists = await prisma.broadcastLog.findFirst({ where: { id: broadcastId, ...visibleTenantWhere(actor, tenantId) }, select: { id: true } });
    if (!exists) throw new MessageJobError("BROADCAST_NOT_FOUND", "Broadcast was not found", 404, false);
    throw new MessageJobError("INVALID_BROADCAST_STATE", errorMessage, 409, false);
  }
  return getBroadcast(actor, broadcastId);
}

export function pauseBroadcast(actor: BroadcastActor, broadcastId: string) {
  return changeBroadcastState(actor, broadcastId, ["QUEUED", "RUNNING"], {
    status: "PAUSED",
    pausedAt: new Date(),
    lockedBy: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
  }, "Only a queued or running broadcast can be paused");
}

export async function resumeBroadcast(actor: BroadcastActor, broadcastId: string) {
  await requireEntitlement(actor.id, "BROADCASTS_MONTHLY");
  return changeBroadcastState(actor, broadcastId, ["PAUSED", "FAILED"], {
    status: "QUEUED",
    pausedAt: null,
    failedAt: null,
    nextDispatchAt: new Date(),
    safeErrorCode: null,
    safeErrorMessage: null,
    lockedBy: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
  }, "Only a paused or failed broadcast can be resumed");
}

export async function cancelBroadcast(actor: BroadcastActor, broadcastId: string) {
  const tenantId = await actorTenant(actor);
  const now = new Date();
  const cancelled = await prisma.$transaction(async (tx) => {
    const changed = await tx.broadcastLog.updateMany({
      where: {
        id: broadcastId,
        ...visibleTenantWhere(actor, tenantId),
        status: { in: ["QUEUED", "RUNNING", "PAUSED", "FAILED"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (changed.count === 0) return null;
    const recipients = await tx.broadcastRecipient.updateMany({
      where: { broadcastLogId: broadcastId, status: { in: ["PENDING", "CLAIMED"] } },
      data: { status: "CANCELLED", skippedAt: now, safeErrorCode: "BROADCAST_CANCELLED", safeErrorMessage: "Broadcast was cancelled before enqueue" },
    });
    await tx.broadcastLog.update({ where: { id: broadcastId }, data: { cancelled: { increment: recipients.count } } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!cancelled) {
    const exists = await prisma.broadcastLog.findFirst({ where: { id: broadcastId, ...visibleTenantWhere(actor, tenantId) }, select: { id: true } });
    if (!exists) throw new MessageJobError("BROADCAST_NOT_FOUND", "Broadcast was not found", 404, false);
    throw new MessageJobError("INVALID_BROADCAST_STATE", "Completed or cancelled broadcasts cannot be cancelled", 409, false);
  }
  return getBroadcast(actor, broadcastId);
}
