import crypto from "node:crypto";

/**
 * Email OTP login rules. Kept free of Prisma so the API route, the NextAuth
 * provider, and the tests all read the same numbers.
 */

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// Email is slower than WhatsApp and the user is staring at the login screen, so
// the per-email window is the one that matters most: it is what stops a single
// mailbox being used as a free relay.
export const OTP_EMAIL_SEND_LIMIT = 3;
export const OTP_EMAIL_SEND_WINDOW_MS = 15 * 60 * 1000;
export const OTP_IP_SEND_LIMIT = 10;
export const OTP_IP_SEND_WINDOW_MS = 60 * 60 * 1000;

// Verification is already capped per challenge. This stops one address grinding
// through many challenges instead.
export const OTP_IP_VERIFY_LIMIT = 30;
export const OTP_IP_VERIFY_WINDOW_MS = 15 * 60 * 1000;

// Domain separation, so this secret cannot be replayed against another feature
// that happens to HMAC the same input.
const HMAC_CONTEXT = "pesanpro-otp-v1";
const CODE_PATTERN = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`);

/**
 * Uniform over the whole range. `randomInt` is cryptographically secure and
 * rejects rather than folds, so no digit is more likely than another.
 */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, "0");
}

/** Accepts a pasted "123 456" or "123-456" and returns the digits. */
export function normalizeOtpCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function isOtpCodeFormat(value: string): boolean {
  return CODE_PATTERN.test(value);
}

export function hashOtpCode(code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${HMAC_CONTEXT}:${code}`, "utf8").digest("hex");
}

export function verifyOtpCode(code: string, codeHash: string, secret: string): boolean {
  const expected = Buffer.from(hashOtpCode(code, secret), "hex");
  const stored = Buffer.from(codeHash, "hex");
  // A malformed or truncated stored hash must fail here rather than throw.
  if (expected.length === 0 || expected.length !== stored.length) return false;
  return crypto.timingSafeEqual(expected, stored);
}

export function isOtpChallengeActive(
  challenge: { consumedAt: Date | null; expiresAt: Date; attempts: number },
  now: Date,
): boolean {
  if (challenge.consumedAt) return false;
  if (challenge.expiresAt.getTime() <= now.getTime()) return false;
  return challenge.attempts < OTP_MAX_ATTEMPTS;
}

/** Milliseconds the user still has to wait before a new code may be sent. */
export function otpResendWaitMs(lastSentAt: Date | null | undefined, now: Date): number {
  if (!lastSentAt) return 0;
  return Math.max(0, OTP_RESEND_COOLDOWN_MS - (now.getTime() - lastSentAt.getTime()));
}

export function otpAttemptsRemaining(attempts: number): number {
  return Math.max(0, OTP_MAX_ATTEMPTS - attempts);
}
