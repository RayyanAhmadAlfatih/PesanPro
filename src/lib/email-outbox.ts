import crypto from "node:crypto";
import { Prisma, type EmailOutbox } from "@prisma/client";
import { prisma } from "./prisma";
import { EmailTransportError, sendSmtpEmail, type OutgoingEmail } from "./email-transport";

export const DEFAULT_EMAIL_LEASE_MS = 30_000;
export const MAX_EMAIL_ATTEMPTS = 5;

export type ClaimedEmail = { email: EmailOutbox; claimToken: string; leaseMs: number };
export type EmailDeliverer = (email: OutgoingEmail) => Promise<void>;

export function calculateEmailBackoffMs(attempt: number, seed: string, baseMs = 5_000, maxMs = 30 * 60_000) {
  const exponent = Math.max(0, Math.min(10, attempt - 1));
  const raw = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = parseInt(crypto.createHash("sha256").update(`${seed}:${attempt}`).digest("hex").slice(0, 8), 16) / 0xffffffff;
  return Math.max(baseMs, Math.floor(raw * (0.8 + jitter * 0.4)));
}

export async function claimNextEmail(workerId: string, leaseMs = DEFAULT_EMAIL_LEASE_MS): Promise<ClaimedEmail | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  await prisma.$executeRaw(Prisma.sql`
    UPDATE EmailOutbox
    SET status = 'DEAD_LETTER',
        safeErrorCode = 'MAX_ATTEMPTS_EXCEEDED',
        safeErrorMessage = 'Email delivery exceeded the retry limit',
        deadLetteredAt = ${now},
        lockedBy = NULL,
        leaseExpiresAt = NULL,
        heartbeatAt = NULL,
        updatedAt = ${now}
    WHERE status = 'PROCESSING'
      AND leaseExpiresAt < ${now}
      AND attempts >= maxAttempts
  `);
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE EmailOutbox AS emailRow
    INNER JOIN (
      SELECT candidate.id FROM (
        SELECT id FROM EmailOutbox
        WHERE availableAt <= ${now}
          AND (status = 'PENDING' OR (status = 'PROCESSING' AND leaseExpiresAt < ${now}))
          AND attempts < maxAttempts
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = emailRow.id
    SET emailRow.status = 'PROCESSING',
        emailRow.lockedBy = ${claimToken},
        emailRow.leaseExpiresAt = ${leaseExpiresAt},
        emailRow.heartbeatAt = ${now},
        emailRow.attempts = emailRow.attempts + 1,
        emailRow.updatedAt = ${now}
    WHERE emailRow.availableAt <= ${now}
      AND (emailRow.status = 'PENDING' OR (emailRow.status = 'PROCESSING' AND emailRow.leaseExpiresAt < ${now}))
      AND emailRow.attempts < emailRow.maxAttempts
  `);
  if (claimed !== 1) return null;
  const email = await prisma.emailOutbox.findFirst({ where: { status: "PROCESSING", lockedBy: claimToken } });
  return email ? { email, claimToken, leaseMs } : null;
}

export function heartbeatEmail(id: string, claimToken: string, leaseMs = DEFAULT_EMAIL_LEASE_MS) {
  const now = new Date();
  return prisma.emailOutbox.updateMany({
    where: { id, status: "PROCESSING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

export async function executeClaimedEmail(claim: ClaimedEmail, deliverer: EmailDeliverer = sendSmtpEmail) {
  await deliverer({
    messageId: `<${crypto.createHash("sha256").update(claim.email.eventKey).digest("hex")}@pesanpro.local>`,
    toEmail: claim.email.toEmail,
    toName: claim.email.toName,
    subject: claim.email.subject,
    textBody: claim.email.textBody,
    htmlBody: claim.email.htmlBody,
  });
  const sentAt = new Date();
  const updated = await prisma.emailOutbox.updateMany({
    where: { id: claim.email.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: {
      status: "SENT",
      sentAt,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      safeErrorCode: null,
      safeErrorMessage: null,
    },
  });
  return { action: updated.count === 1 ? "SENT" as const : "CLAIM_LOST" as const };
}

function safeEmailError(error: unknown) {
  return error instanceof EmailTransportError
    ? { code: error.code, message: error.message }
    : { code: "SMTP_DELIVERY_FAILED", message: "SMTP delivery failed" };
}

export async function failClaimedEmail(claim: ClaimedEmail, error: unknown) {
  const failure = safeEmailError(error);
  const terminal = claim.email.attempts >= claim.email.maxAttempts;
  const now = new Date();
  const availableAt = new Date(now.getTime() + calculateEmailBackoffMs(claim.email.attempts, claim.email.id));
  const updated = await prisma.emailOutbox.updateMany({
    where: { id: claim.email.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: terminal ? {
      status: "DEAD_LETTER",
      safeErrorCode: failure.code,
      safeErrorMessage: failure.message,
      deadLetteredAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    } : {
      status: "PENDING",
      availableAt,
      safeErrorCode: failure.code,
      safeErrorMessage: failure.message,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
  return { retrying: !terminal && updated.count === 1, code: failure.code, availableAt };
}

export async function recoverEmailClaimsForWorker(workerId: string) {
  const now = new Date();
  const updated = await prisma.emailOutbox.updateMany({
    where: { status: "PROCESSING", lockedBy: { startsWith: `${workerId}:` } },
    data: {
      status: "PENDING",
      availableAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      safeErrorCode: "WORKER_SHUTDOWN",
      safeErrorMessage: "Email worker stopped before delivery completed",
    },
  });
  return updated.count;
}
