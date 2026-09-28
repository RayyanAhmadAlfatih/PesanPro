import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { getEnv } from "./env";
import { buildPasswordResetEmail } from "./password-reset-email";
import { sendSmtpEmail } from "./email-transport";
import {
  generatePasswordResetSecret,
  hashPasswordResetSecret,
  passwordSchema,
} from "./password-policy";

const RESET_TTL_MS = 30 * 60 * 1000;

export interface PasswordResetRequestResult {
  accepted: true;
}

export async function requestPasswordReset(emailInput: string): Promise<PasswordResetRequestResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, status: true },
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

  const env = getEnv();
  const baseUrl = env.PASSWORD_RESET_BASE_URL ?? env.BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/auth/reset-password?token=${encodeURIComponent(secret)}`;
  const content = buildPasswordResetEmail({ userName: user.name, resetUrl });

  try {
    await sendSmtpEmail({
      messageId: `<password-reset-${tokenHash.slice(0, 40)}@pesanpro.local>`,
      toEmail: user.email,
      toName: user.name,
      ...content,
    });
  } catch {
    // Preserve anti-enumeration behavior and never log the reset URL/token or SMTP credentials.
    logger.error("Auth", "Password reset email delivery failed");
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
  const passwordHash = await bcrypt.hash(parsedPassword.data, 12);
  const now = new Date();

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
