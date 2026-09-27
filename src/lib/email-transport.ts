import { SMTPClient } from "emailjs";
import { getEnv } from "./env";

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
  try {
    await client.sendAsync({
      "message-id": email.messageId,
      from: env.SMTP_FROM,
      to: email.toEmail,
      subject: email.subject,
      text: email.textBody,
      attachment: [{ data: email.htmlBody, alternative: true, type: "text/html" }],
    });
  } catch (error) {
    if (error instanceof EmailTransportError) throw error;
    throw new EmailTransportError("SMTP_DELIVERY_FAILED");
  } finally {
    client.smtp.close();
  }
}
