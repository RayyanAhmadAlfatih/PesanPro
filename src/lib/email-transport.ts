import { SMTPClient } from "emailjs";
import { getEnv } from "./env";

export const SMTP_SEND_TIMEOUT_MS = 30_000;

export type OutgoingEmail = {
  messageId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
};

export class EmailTransportError extends Error {
  constructor(public readonly code: "SMTP_NOT_CONFIGURED" | "SMTP_DELIVERY_FAILED") {
    super(code === "SMTP_NOT_CONFIGURED" ? "SMTP delivery is not configured" : "SMTP delivery failed");
    this.name = "EmailTransportError";
  }
}

function smtpClient() {
  const env = getEnv();
  if (!env.SMTP_HOST || !env.SMTP_FROM) throw new EmailTransportError("SMTP_NOT_CONFIGURED");
  return new SMTPClient({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    ssl: env.SMTP_SECURE,
    tls: !env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, password: env.SMTP_PASSWORD }
      : {}),
  });
}

export async function sendSmtpEmail(email: OutgoingEmail) {
  const env = getEnv();
  if (!env.SMTP_FROM) throw new EmailTransportError("SMTP_NOT_CONFIGURED");
  const client = smtpClient();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const send = client.sendAsync({
      "message-id": email.messageId,
      from: env.SMTP_FROM,
      to: email.toEmail,
      subject: email.subject,
      text: email.textBody,
      attachment: [{ data: email.htmlBody, alternative: true, type: "text/html" }],
    });
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new EmailTransportError("SMTP_DELIVERY_FAILED")), SMTP_SEND_TIMEOUT_MS);
      timeout.unref?.();
    });
    await Promise.race([send, deadline]);
  } catch (error) {
    if (error instanceof EmailTransportError) throw error;
    throw new EmailTransportError("SMTP_DELIVERY_FAILED");
  } finally {
    if (timeout) clearTimeout(timeout);
    client.smtp.close();
  }
}
