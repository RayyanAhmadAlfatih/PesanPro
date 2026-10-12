import crypto from "node:crypto";
import { getEnv } from "./env";
import { htmlDocument } from "./email-notifications";
import { sendSmtpEmail } from "./email-transport";
import { OTP_TTL_MS } from "./otp-policy";

const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60_000);

/**
 * The code is sent straight through the configured SMTP transport instead of
 * the email outbox. The outbox keeps every body forever, and a stored six digit
 * login code would turn database read access into account takeover. It also has
 * no purge, so nothing would ever clean it up.
 */
export function isLoginOtpEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

export function buildLoginOtpEmail(input: { code: string; toName?: string | null }) {
  const appName = getEnv().APP_NAME;
  const greeting = input.toName?.trim() ? `Halo ${input.toName.trim()},` : undefined;
  const subject = `Kode login ${appName}: ${input.code}`;
  const textBody = [
    greeting ?? "Halo,",
    "",
    `Kode login Anda: ${input.code}`,
    "",
    `Masukkan kode ini di halaman login ${appName}. Kode berlaku ${OTP_TTL_MINUTES} menit dan hanya bisa dipakai sekali.`,
    "Kalau Anda tidak meminta kode ini, abaikan email ini dan ganti password Anda.",
  ].join("\n");
  const htmlBody = htmlDocument({
    heading: "Kode login Anda",
    greeting,
    paragraphs: [
      `Masukkan kode ini di halaman login ${appName}. Kode berlaku ${OTP_TTL_MINUTES} menit dan hanya bisa dipakai sekali.`,
      "Kalau Anda tidak meminta kode ini, abaikan email ini dan ganti password Anda.",
    ],
    code: input.code,
  });
  return { subject, textBody, htmlBody };
}

export async function sendLoginOtpEmail(input: {
  toEmail: string;
  toName?: string | null;
  code: string;
}): Promise<void> {
  const content = buildLoginOtpEmail(input);
  await sendSmtpEmail({
    messageId: `<${crypto.randomUUID()}@pesanpro>`,
    toEmail: input.toEmail,
    toName: input.toName,
    ...content,
  });
}
