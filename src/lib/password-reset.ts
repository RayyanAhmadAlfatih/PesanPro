import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logger } from "./logger";
import {
  generatePasswordResetSecret,
  hashPasswordResetSecret,
  passwordSchema,
} from "./password-policy";

const RESET_TTL_MS = 30 * 60 * 1000;

export interface PasswordResetRequestResult {
  accepted: true;
}

async function sendResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;

  if (!apiKey || !from) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset password PesanPro",
      text: `Gunakan tautan berikut untuk mengatur ulang password PesanPro. Tautan berlaku 30 menit: ${resetUrl}`,
      html: `<p>Gunakan tautan berikut untuk mengatur ulang password PesanPro.</p><p><a href="${resetUrl}">Reset password</a></p><p>Tautan berlaku 30 menit.</p>`,
    }),
  });

  return response.ok;
}

export async function requestPasswordReset(emailInput: string): Promise<PasswordResetRequestResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    return { accepted: true };
  }

  const secret = generatePasswordResetSecret();
  const tokenHash = hashPasswordResetSecret(secret);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    }),
  ]);

  const baseUrl = process.env.PASSWORD_RESET_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/auth/reset-password?token=${encodeURIComponent(secret)}`;

  // The endpoint must stay enumeration-safe (always `accepted: true`), so the
  // user gets no signal when delivery is impossible. Surface it loudly to the
  // operator instead, naming the missing configuration, so lockouts are
  // diagnosable rather than silent.
  if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM) {
    logger.error(
      "Auth",
      "Password reset requested but email delivery is not configured (set RESEND_API_KEY and PASSWORD_RESET_FROM); no reset email was sent",
    );
    return { accepted: true };
  }

  try {
    const delivered = await sendResetEmail(user.email, resetUrl);
    if (!delivered && process.env.NODE_ENV === "production") {
      logger.error("Auth", "Password reset email delivery failed; the reset link could not be delivered");
    }
  } catch (error) {
    logger.error("Auth", "Password reset email delivery failed", error);
  }

  return { accepted: true };
}

export interface PasswordResetConsumeResult {
  success: boolean;
  userId?: string;
}

export async function consumePasswordReset(secret: string, newPassword: string): Promise<PasswordResetConsumeResult> {
  const parsedPassword = passwordSchema.safeParse(newPassword);
  if (!parsedPassword.success || secret.length < 32 || secret.length > 256) {
    return { success: false };
  }

  const tokenHash = hashPasswordResetSecret(secret);
  const now = new Date();

  // Validate the token before spending CPU on bcrypt. Hashing first let an
  // unauthenticated caller force a cost-12 hash per request regardless of
  // whether the token existed, which is a cheap CPU-exhaustion vector.
  const candidate = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { usedAt: true, expiresAt: true },
  });
  if (!candidate || candidate.usedAt || candidate.expiresAt <= now) {
    return { success: false };
  }

  const passwordHash = await bcrypt.hash(parsedPassword.data, 12);

  return prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });

    if (!token || token.usedAt || token.expiresAt <= now) {
      return { success: false };
    }

    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      return { success: false };
    }

    await tx.user.update({
      where: { id: token.userId },
      data: {
        password: passwordHash,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.passwordResetToken.deleteMany({
      where: { userId: token.userId, id: { not: token.id } },
    });

    return { success: true, userId: token.userId };
  });
}
