import crypto from "node:crypto";
import { MessageJobStatus, MessageJobType, Prisma, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { hashCanonicalJson } from "./canonical-json";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient } from "./message-recipient";
import { prisma } from "./prisma";
import { resolveTenantId } from "./billing";
import { commitReservedUsage, releaseReservedUsage, reserveUsage } from "./usage";

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MessageJobActor = {
  id: string;
  role: Role;
  ownerId?: string | null;
  apiKeyId?: string;
};

export type EnqueueMessageInput = {
  actor: MessageJobActor;
  operation: string;
  idempotencyKey: string;
  sessionPublicId: string;
  recipient: string;
  type: MessageJobType;
  text?: string;
  caption?: string;
  mediaId?: string;
  mentions?: string[];
  quotedMessageId?: string;
  maxAttempts?: number;
  priority?: number;
};

export class IdempotencyConflictError extends MessageJobError {
  constructor() {
    super("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request", 409, false);
  }
}

export class MessageJobNotFoundError extends MessageJobError {
  constructor() {
    super("MESSAGE_JOB_NOT_FOUND", "Message job was not found", 404, false);
  }
}

export class MessageJobStateError extends MessageJobError {
  constructor(message: string) {
    super("INVALID_JOB_STATE", message, 409, false);
  }
}

function publicJob<T extends {
  id: string; status: MessageJobStatus; type: MessageJobType; recipient: string; whatsappMessageId: string | null;
  attempts: number; maxAttempts: number; safeErrorCode: string | null; safeErrorMessage: string | null;
  availableAt: Date; sentAt: Date | null; deliveredAt: Date | null; readAt: Date | null; failedAt: Date | null;
  cancelledAt: Date | null; createdAt: Date; updatedAt: Date;
}>(job: T) {
  return {
    id: job.id,
    status: job.status,
    type: job.type,
    recipient: job.recipient,
    whatsappMessageId: job.whatsappMessageId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: job.safeErrorCode ? { code: job.safeErrorCode, message: job.safeErrorMessage } : null,
    availableAt: job.availableAt,
    sentAt: job.sentAt,
    deliveredAt: job.deliveredAt,
    readAt: job.readAt,
    failedAt: job.failedAt,
    cancelledAt: job.cancelledAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export const serializeMessageJob = publicJob;

async function getExistingJob(tenantId: string, operation: string, idempotencyKey: string) {
  return prisma.messageJob.findUnique({
    where: { tenantId_operation_idempotencyKey: { tenantId, operation, idempotencyKey } },
  });
}

export async function enqueueMessage(input: EnqueueMessageInput) {
  const tenantId = await resolveTenantId(input.actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  const allowed = await canAccessSession(input.actor.id, input.actor.role, input.sessionPublicId);
  if (!allowed) throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);

  const session = await prisma.session.findUnique({ where: { sessionId: input.sessionPublicId }, select: { id: true, userId: true } });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  const recipient = normalizeRecipient(input.recipient);
  if (input.type === "TEXT" && !input.text?.trim()) throw new MessageJobError("INVALID_MESSAGE", "Text is required", 422, false);
  if (input.type !== "TEXT" && !input.mediaId) throw new MessageJobError("INVALID_MEDIA", "Media ID is required", 422, false);

  if (input.mediaId) {
    const media = await prisma.privateMedia.findFirst({ where: { id: input.mediaId, tenantId, status: "ACTIVE" }, select: { id: true, mediaType: true } });
    if (!media || media.mediaType !== input.type) throw new MessageJobError("MEDIA_NOT_FOUND", "Compatible media was not found", 404, false);
  }

  const requestPayload = {
    sessionId: input.sessionPublicId,
    recipient,
    type: input.type,
    text: input.text?.trim() || null,
    caption: input.caption?.trim() || null,
    mediaId: input.mediaId ?? null,
    mentions: input.mentions ?? [],
    quotedMessageId: input.quotedMessageId ?? null,
  } satisfies Prisma.InputJsonObject;
  const requestHash = hashCanonicalJson(requestPayload);
  const existing = await getExistingJob(tenantId, input.operation, input.idempotencyKey);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
    return { job: publicJob(existing), idempotent: true };
  }

  const quotaReservationKey = `message-job:${input.operation}:${input.idempotencyKey}`;
  await reserveUsage({
    userId: input.actor.id,
    feature: "MESSAGES_MONTHLY",
    amount: BigInt(1),
    idempotencyKey: quotaReservationKey,
    apiKeyId: input.actor.apiKeyId,
    meta: { sessionId: input.sessionPublicId, operation: input.operation },
  });

  try {
    const job = await prisma.messageJob.create({
      data: {
        tenantId,
        requestedById: input.actor.id,
        sessionId: session.id,
        apiKeyId: input.actor.apiKeyId,
        mediaId: input.mediaId,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        requestPayload,
        type: input.type,
        recipient,
        text: input.text?.trim(),
        caption: input.caption?.trim(),
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts ?? 5,
        whatsappMessageId: `PP${crypto.createHash("sha256").update(`${tenantId}:${input.operation}:${input.idempotencyKey}`).digest("hex").slice(0, 30).toUpperCase()}`,
        quotaReservationKey,
        idempotencyRecord: {
          create: {
            tenantId,
            operation: input.operation,
            key: input.idempotencyKey,
            requestHash,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          },
        },
      },
    });
    return { job: publicJob(job), idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await getExistingJob(tenantId, input.operation, input.idempotencyKey);
      if (raced) {
        if (raced.requestHash !== requestHash) throw new IdempotencyConflictError();
        return { job: publicJob(raced), idempotent: true };
      }
    }
    await releaseReservedUsage({ userId: input.actor.id, feature: "MESSAGES_MONTHLY", idempotencyKey: quotaReservationKey }).catch(() => undefined);
    throw error;
  }
}

export async function getMessageJob(actor: MessageJobActor, jobId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobNotFoundError();
  const job = await prisma.messageJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new MessageJobNotFoundError();
  return publicJob(job);
}

export async function listMessageJobs(actor: MessageJobActor, input: { status?: MessageJobStatus; cursor?: string; limit?: number }) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobNotFoundError();
  const requestedLimit = Number.isInteger(input.limit) ? input.limit! : 25;
  const limit = Math.min(100, Math.max(1, requestedLimit));
  const jobs = await prisma.messageJob.findMany({
    where: { tenantId, ...(input.status ? { status: input.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = jobs.length > limit;
  const page = hasMore ? jobs.slice(0, limit) : jobs;
  return { data: page.map(publicJob), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function cancelMessageJob(actor: MessageJobActor, jobId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobNotFoundError();
  const cancelledAt = new Date();
  const updated = await prisma.messageJob.updateMany({
    where: { id: jobId, tenantId, status: "QUEUED" },
    data: { status: "CANCELLED", cancelledAt, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  });
  if (updated.count === 0) {
    const existing = await prisma.messageJob.findFirst({ where: { id: jobId, tenantId } });
    if (!existing) throw new MessageJobNotFoundError();
    throw new MessageJobStateError("Only a queued message can be cancelled");
  }
  const job = await prisma.messageJob.findUniqueOrThrow({ where: { id: jobId } });
  await releaseReservedUsage({ userId: job.requestedById, feature: "MESSAGES_MONTHLY", idempotencyKey: job.quotaReservationKey });
  return publicJob(job);
}

export async function retryMessageJob(actor: MessageJobActor, jobId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobNotFoundError();
  const job = await prisma.messageJob.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new MessageJobNotFoundError();
  if (job.status !== "FAILED") throw new MessageJobStateError("Only a failed message can be retried");

  const quotaReservationKey = `message-retry:${crypto.createHash("sha256").update(`${job.id}:${job.attempts}`).digest("hex")}`;
  await reserveUsage({
    userId: actor.id,
    feature: "MESSAGES_MONTHLY",
    amount: BigInt(1),
    idempotencyKey: quotaReservationKey,
    apiKeyId: actor.apiKeyId,
    meta: { messageJobId: job.id, operation: "message.retry" },
  });

  const updated = await prisma.messageJob.updateMany({
    where: { id: job.id, tenantId, status: "FAILED" },
    data: {
      status: "QUEUED",
      availableAt: new Date(),
      maxAttempts: Math.max(job.maxAttempts, job.attempts + 5),
      quotaReservationKey,
      failedAt: null,
      deadLetteredAt: null,
      safeErrorCode: null,
      safeErrorMessage: null,
      lastErrorAt: null,
    },
  });
  if (updated.count === 0) {
    const current = await prisma.messageJob.findUniqueOrThrow({ where: { id: job.id } });
    if (current.status === "QUEUED") return publicJob(current);
    throw new MessageJobStateError("Message state changed before retry could start");
  }
  return publicJob(await prisma.messageJob.findUniqueOrThrow({ where: { id: job.id } }));
}

export async function settleMessageQuota(job: { requestedById: string; quotaReservationKey: string }, outcome: "COMMIT" | "RELEASE") {
  if (outcome === "COMMIT") {
    return commitReservedUsage({ userId: job.requestedById, feature: "MESSAGES_MONTHLY", idempotencyKey: job.quotaReservationKey });
  }
  return releaseReservedUsage({ userId: job.requestedById, feature: "MESSAGES_MONTHLY", idempotencyKey: job.quotaReservationKey });
}
