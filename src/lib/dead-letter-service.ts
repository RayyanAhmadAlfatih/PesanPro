import type { Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { recordAudit } from "./audit";
import { resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { deleteMessageJob, MessageJobNotFoundError, MessageJobStateError } from "./message-job-service";
import { prisma } from "./prisma";
import { releaseReservedUsage, reserveUsage } from "./usage";

export type DeadLetterActor = {
  id: string;
  role: Role;
  ownerId?: string | null;
  email?: string | null;
  apiKeyId?: string;
};

export type TenantDeadLetter = {
  id: string;
  recipient: string;
  text: string;
  failedAt: string;
  safeErrorCode: string | null;
};

const SNIPPET_LENGTH = 120;

export class SessionOfflineError extends MessageJobError {
  constructor() {
    super("SESSION_OFFLINE", "Perangkat WhatsApp belum terhubung. Hubungkan dulu perangkatnya sebelum mengirim ulang.", 409, true);
  }
}

async function tenantScope(actor: DeadLetterActor) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobNotFoundError();
  return tenantId;
}

export async function listTenantDeadLetters(actor: DeadLetterActor): Promise<TenantDeadLetter[]> {
  const tenantId = await tenantScope(actor);
  const jobs = await prisma.messageJob.findMany({
    where: { tenantId, status: "FAILED", deadLetteredAt: { not: null } },
    orderBy: [{ deadLetteredAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, recipient: true, text: true, caption: true, failedAt: true, deadLetteredAt: true, safeErrorCode: true },
  });
  return jobs.map((job) => ({
    id: job.id,
    recipient: job.recipient,
    text: (job.text ?? job.caption ?? "").slice(0, SNIPPET_LENGTH),
    failedAt: (job.deadLetteredAt ?? job.failedAt ?? new Date()).toISOString(),
    safeErrorCode: job.safeErrorCode,
  }));
}

const RESEND_KEY_PREFIX = "message-dead-letter-resend:";

function resendReservationKey(jobId: string, idempotencyKey: string) {
  return `${RESEND_KEY_PREFIX}${jobId}:${idempotencyKey}`;
}

export async function resendTenantDeadLetter(actor: DeadLetterActor, jobId: string) {
  const tenantId = await tenantScope(actor);
  const job = await prisma.messageJob.findFirst({
    where: { id: jobId, tenantId, status: "FAILED", deadLetteredAt: { not: null } },
  });
  if (!job) {
    const existing = await prisma.messageJob.findFirst({ where: { id: jobId, tenantId }, select: { status: true, quotaReservationKey: true } });
    if (!existing) throw new MessageJobNotFoundError();
    if (existing.status === "QUEUED" && existing.quotaReservationKey.startsWith(RESEND_KEY_PREFIX)) {
      return { id: jobId, status: "QUEUED" as const, idempotent: true };
    }
    throw new MessageJobStateError("Pesan ini sudah tidak menunggu keputusan");
  }

  const session = await prisma.session.findFirst({
    where: { id: job.sessionId },
    select: { sessionId: true, status: true, userId: true },
  });
  if (!session || session.status !== "CONNECTED" || !await canAccessSession(actor.id, actor.role, session.sessionId)) {
    throw new SessionOfflineError();
  }

  const reservationKey = resendReservationKey(job.id, job.idempotencyKey);
  let reserved = false;
  try {
    await reserveUsage({
      userId: actor.id,
      feature: "MESSAGES_MONTHLY",
      amount: BigInt(1),
      idempotencyKey: reservationKey,
      apiKeyId: job.apiKeyId ?? actor.apiKeyId,
      meta: { operation: "message.dead_letter_resend", messageJobId: job.id },
    });
    reserved = true;

    const updated = await prisma.messageJob.updateMany({
      where: { id: job.id, tenantId, status: "FAILED", deadLetteredAt: { not: null } },
      data: {
        status: "QUEUED",
        availableAt: new Date(),
        attempts: 0,
        deadLetteredAt: null,
        failedAt: null,
        lastErrorAt: null,
        safeErrorCode: null,
        safeErrorMessage: null,
        quotaReservationKey: reservationKey,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (updated.count === 0) {
      const current = await prisma.messageJob.findUnique({ where: { id: job.id } });
      if (current?.status === "QUEUED") {
        if (current.quotaReservationKey !== reservationKey) {
          await releaseReservedUsage({ userId: actor.id, feature: "MESSAGES_MONTHLY", idempotencyKey: reservationKey }).catch(() => undefined);
        }
        return { id: job.id, status: "QUEUED" as const, idempotent: true };
      }
      throw new MessageJobStateError("Status pesan berubah sebelum pengiriman ulang dimulai");
    }

    await recordAudit({
      userId: actor.id,
      userEmail: actor.email ?? null,
      action: "message.dead_letter_resent",
      resource: "message_job",
      resourceId: job.id,
      meta: { tenantId, operation: "message.dead_letter_resend" },
    });
    return { id: job.id, status: "QUEUED" as const, idempotent: false };
  } catch (error) {
    if (reserved) {
      await releaseReservedUsage({ userId: actor.id, feature: "MESSAGES_MONTHLY", idempotencyKey: reservationKey }).catch(() => undefined);
    }
    throw error;
  }
}

export async function dismissTenantDeadLetter(actor: DeadLetterActor, jobId: string) {
  const tenantId = await tenantScope(actor);
  const job = await prisma.messageJob.findFirst({
    where: { id: jobId, tenantId, status: "FAILED", deadLetteredAt: { not: null } },
    select: { id: true, safeErrorCode: true },
  });
  if (!job) throw new MessageJobNotFoundError();

  const result = await deleteMessageJob(actor, jobId);
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email ?? null,
    action: "message.dead_letter_dismissed",
    resource: "message_job",
    resourceId: jobId,
    meta: { tenantId, safeErrorCode: job.safeErrorCode },
  });
  return result;
}
