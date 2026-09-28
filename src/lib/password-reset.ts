import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { buildPasswordResetEmail } from "./email-notifications";
import { EmailTransportError, sendSmtpEmail } from "./email-transport";
import {
  generatePasswordResetSecret,
  hashPasswordResetSecret,
  passwordSchema,
} from "./password-policy";

const RESET_TTL_MS = 30 * 60 * 1000;

export interface PasswordResetRequestResult {
  accepted: true;
}

/**
 * The Message-ID must not carry the raw reset secret. The token hash is
 * one-way, so deriving the identifier from it is safe to expose in mail
 * headers and logs.
 */
function passwordResetMessageId(tokenHash: string, resetUrl: string): string {
  let host = "pesanpro.local";
  try {
    host = new URL(resetUrl).hostname;
  } catch {
    // keep the fallback host
  }
  return `password-reset.${tokenHash.slice(0, 32)}@${host}`;
}

async function sendResetEmail(input: {
  toEmail: string;
  toName: string | null;
  tokenHash: string;
  resetUrl: string;
}): Promise<void> {
  const content = buildPasswordResetEmail({ userName: input.toName, resetUrl: input.resetUrl });
  await sendSmtpEmail({
    messageId: passwordResetMessageId(input.tokenHash, input.resetUrl),
    toEmail: input.toEmail,
    toName: input.toName,
    ...content,
  });
}

export async function requestPasswordReset(emailInput: string): Promise<PasswordResetRequestResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true },
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

  try {
    await sendResetEmail({ toEmail: user.email, toName: user.name, tokenHash, resetUrl });
  } catch (error) {
    // Keep the public response generic regardless of delivery outcome:
    // it must never hint whether the account exists, and logs must never
    // carry the reset secret, the reset URL, or SMTP credentials.
    if (error instanceof EmailTransportError && error.code === "SMTP_NOT_CONFIGURED") {
      if (process.env.NODE_ENV === "production") {
        logger.error("Auth", "Password reset email delivery is not configured");
      }
    } else {
      const code = error instanceof EmailTransportError ? error.code : "unknown";
      logger.error("Auth", `Password reset email delivery failed (${code})`);
    }
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
