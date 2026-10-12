import { prisma } from "./prisma";
import { logger } from "./logger";
import { getEnv } from "./env";
import { checkPersistentRateLimit } from "./rate-limit";
import { recordAudit } from "./audit";
import { EmailTransportError } from "./email-transport";
import { isLoginOtpEmailConfigured, sendLoginOtpEmail } from "./otp-email";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EMAIL_SEND_LIMIT,
  OTP_EMAIL_SEND_WINDOW_MS,
  OTP_IP_SEND_LIMIT,
  OTP_IP_SEND_WINDOW_MS,
  OTP_IP_VERIFY_LIMIT,
  OTP_IP_VERIFY_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  otpAttemptsRemaining,
  otpResendWaitMs,
  verifyOtpCode,
} from "./otp-policy";

export type OtpRequestResult =
  | { ok: true; resendAfterMs: number }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number }
  | { ok: false; reason: "cooldown"; retryAfterMs: number }
  | { ok: false; reason: "email_unavailable" }
  | { ok: false; reason: "undeliverable" };

export type OtpVerifyFailure =
  | "no_challenge"
  | "expired"
  | "attempts_exhausted"
  | "wrong_code"
  | "rate_limited";

export type OtpVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: OtpVerifyFailure; attemptsRemaining?: number };

interface OtpActor {
  ip: string;
  userAgent?: string | null;
}

/**
 * Issues a login code. The code itself never reaches the database: only its
 * HMAC is stored, and the plaintext lives just long enough to be handed to the
 * SMTP transport.
 */
export async function requestLoginOtp(input: OtpActor & { email: string }): Promise<OtpRequestResult> {
  const now = new Date();

  if (!isLoginOtpEmailConfigured()) {
    // Queueing without SMTP would promise a code that can never arrive.
    return { ok: false, reason: "email_unavailable" };
  }

  const emailLimit = await checkPersistentRateLimit(`otp-email:${input.email}`, OTP_EMAIL_SEND_LIMIT, OTP_EMAIL_SEND_WINDOW_MS);
  if (!emailLimit.success) {
    return { ok: false, reason: "rate_limited", retryAfterMs: emailLimit.retryAfterMs ?? OTP_EMAIL_SEND_WINDOW_MS };
  }
  const ipLimit = await checkPersistentRateLimit(`otp-ip:${input.ip}`, OTP_IP_SEND_LIMIT, OTP_IP_SEND_WINDOW_MS);
  if (!ipLimit.success) {
    return { ok: false, reason: "rate_limited", retryAfterMs: ipLimit.retryAfterMs ?? OTP_IP_SEND_WINDOW_MS };
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, status: true },
  });
  // A suspended account answers exactly like an unknown address. Sending a code
  // to an account that cannot sign in wastes an email, and telling the two
  // apart would let anyone probe which addresses have accounts. The rate limits
  // above already cap that probing.
  if (!user || user.status !== "ACTIVE") {
    return { ok: false, reason: "undeliverable" };
  }

  const lastChallenge = await prisma.otpChallenge.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const waitMs = otpResendWaitMs(lastChallenge?.createdAt ?? null, now);
  if (waitMs > 0) return { ok: false, reason: "cooldown", retryAfterMs: waitMs };

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code, getEnv().AUTH_SECRET);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await prisma.$transaction([
    // Only one code may be live. Requesting a new one retires the previous, so
    // an older email cannot be replayed.
    prisma.otpChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } }),
    prisma.otpChallenge.create({ data: { userId: user.id, email: user.email, codeHash, expiresAt } }),
  ]);

  try {
    await sendLoginOtpEmail({ toEmail: user.email, toName: user.name, code });
  } catch (error) {
    logger.error("Auth", "OTP login email delivery failed", error);
    await recordAudit({
      userId: user.id,
      userEmail: user.email,
      action: "user.otp_request_failed",
      resource: "user",
      resourceId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { code: error instanceof EmailTransportError ? error.code : "SMTP_DELIVERY_FAILED" },
    });
    return { ok: false, reason: "email_unavailable" };
  }

  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: "user.otp_request",
    resource: "user",
    resourceId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
    meta: { expiresAt: expiresAt.toISOString() },
  });

  return { ok: true, resendAfterMs: OTP_RESEND_COOLDOWN_MS };
}

/**
 * Checks a code and burns it on success. The consumed flag is written with a
 * compare-and-set, so two requests arriving together cannot both sign in.
 */
export async function verifyLoginOtp(
  input: OtpActor & { email: string; code: string },
): Promise<OtpVerifyResult> {
  const now = new Date();

  const ipLimit = await checkPersistentRateLimit(`otp-verify:${input.ip}`, OTP_IP_VERIFY_LIMIT, OTP_IP_VERIFY_WINDOW_MS);
  if (!ipLimit.success) return { ok: false, reason: "rate_limited" };

  const challenge = await prisma.otpChallenge.findFirst({
    where: { email: input.email },
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true, email: true, codeHash: true, attempts: true, expiresAt: true, consumedAt: true },
  });
  if (!challenge || challenge.consumedAt) return { ok: false, reason: "no_challenge" };
  if (challenge.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "attempts_exhausted" };

  if (!verifyOtpCode(input.code, challenge.codeHash, getEnv().AUTH_SECRET)) {
    const updated = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const attemptsRemaining = otpAttemptsRemaining(updated.attempts);
    await recordAudit({
      userId: challenge.userId,
      userEmail: challenge.email,
      action: "user.otp_verify_failed",
      resource: "user",
      resourceId: challenge.userId,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: { attemptsRemaining },
    });
    return {
      ok: false,
      reason: attemptsRemaining === 0 ? "attempts_exhausted" : "wrong_code",
      attemptsRemaining,
    };
  }

  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return { ok: false, reason: "no_challenge" };

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, email: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") return { ok: false, reason: "no_challenge" };

  await recordAudit({
    userId: user.id,
    userEmail: user.email,
    action: "user.otp_verify",
    resource: "user",
    resourceId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true, userId: user.id };
}
