import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { sendSmtpEmail } from "./email-transport";
import {
  generatePasswordResetSecret,
  hashPasswordResetSecret,
  passwordSchema,
} from "./password-policy";

const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_SUBJECT = "Reset password PesanPro";

export interface PasswordResetRequestResult {
  accepted: true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function buildPasswordResetEmail(resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  const textBody = [
    "Halo,",
    "",
    "Kami menerima permintaan untuk mengatur ulang password akun PesanPro Anda.",
    "",
    "Buka tautan ini dalam 30 menit:",
    resetUrl,
    "",
    "Kalau Anda tidak meminta reset password, abaikan email ini. Password Anda tidak berubah.",
    "",
    "Salam,",
    "Tim PesanPro",
  ].join("\n");
  const htmlBody = [
    '<div style="background:#fcfaf5;padding:24px;font-family:Arial,sans-serif;color:#1a3300;">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #b6b6b6;padding:24px;">',
    '<p style="display:inline-block;background:#ffe95c;color:#1a3300;font-weight:bold;padding:8px 12px;margin:0;">PesanPro</p>',
    "<h1 style=\"font-size:20px;margin:20px 0 12px;\">Atur ulang password</h1>",
    "<p>Kami menerima permintaan untuk mengatur ulang password akun PesanPro Anda.</p>",
    '<p style="margin:24px 0;"><a href="' + safeUrl + '" style="background:#1a3300;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:bold;">Reset password</a></p>',
    "<p>Tautan berlaku 30 menit. Kalau Anda tidak meminta reset password, abaikan email ini. Password Anda tidak berubah.</p>",
    '<p style="font-size:12px;color:#555555;border-top:1px solid #b6b6b6;padding-top:12px;margin-top:24px;">Tautan alternatif: <a href="' + safeUrl + '">' + safeUrl + "</a></p>",
    "</div>",
    "</div>",
  ].join("");
  return { textBody, htmlBody };
}

async function sendResetEmail(email: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;

  if (!apiKey || !from) {
    return false;
  }

  const { textBody, htmlBody } = buildPasswordResetEmail(resetUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: RESET_SUBJECT,
      text: textBody,
      html: htmlBody,
    }),
  });

  return response.ok;
}

// Password reset is delivered over the configured SMTP transport first, which
// is what operators are told to configure. Resend remains as a fallback so
// deployments that already rely on it keep working.
function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM);
}

async function sendResetEmailViaSmtp(email: string, resetUrl: string): Promise<boolean> {
  const { textBody, htmlBody } = buildPasswordResetEmail(resetUrl);
  try {
    await sendSmtpEmail({
      messageId: `<${crypto.randomUUID()}@pesanpro>`,
      toEmail: email,
      subject: RESET_SUBJECT,
      textBody,
      htmlBody,
    });
    return true;
  } catch (error) {
    logger.error("Auth", "Password reset email delivery over SMTP failed", error);
    return false;
  }
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
  const useSmtp = smtpConfigured();
  if (!useSmtp && !resendConfigured()) {
    logger.error(
      "Auth",
      "Password reset requested but no email transport is configured (set SMTP_HOST/SMTP_FROM or RESEND_API_KEY/PASSWORD_RESET_FROM); no reset email was sent",
    );
    return { accepted: true };
  }

  try {
    const delivered = useSmtp
      ? await sendResetEmailViaSmtp(user.email, resetUrl)
      : await sendResetEmail(user.email, resetUrl);
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
