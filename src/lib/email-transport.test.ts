import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({
  close: vi.fn(),
  options: [] as Array<Record<string, unknown>>,
  sendAsync: vi.fn(),
}));

vi.mock("emailjs", () => ({
  SMTPClient: class {
    smtp = { close: smtp.close };

    constructor(options: Record<string, unknown>) {
      smtp.options.push(options);
    }

    sendAsync(message: unknown) {
      return smtp.sendAsync(message);
    }
  },
}));

import { _resetEnvCache } from "./env";
import { sendSmtpEmail } from "./email-transport";

const email = {
  messageId: "<message@example.com>",
  toEmail: "user@example.com",
  subject: "Pembayaran dikonfirmasi",
  textBody: "Paket Anda aktif.",
  htmlBody: "<p>Paket Anda aktif.</p>",
};

describe("SMTP email transport", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_USER", "mailer");
    vi.stubEnv("SMTP_PASSWORD", "private-password");
    vi.stubEnv("SMTP_FROM", "PesanPro <no-reply@example.com>");
    smtp.close.mockReset();
    smtp.options.length = 0;
    smtp.sendAsync.mockReset().mockResolvedValue(undefined);
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("sends multipart email over STARTTLS and closes the connection", async () => {
    await sendSmtpEmail(email);

    expect(smtp.options).toEqual([expect.objectContaining({
      host: "smtp.example.com",
      port: 587,
      ssl: false,
      tls: true,
      user: "mailer",
      password: "private-password",
    })]);
    expect(smtp.sendAsync).toHaveBeenCalledWith(expect.objectContaining({
      "message-id": "<message@example.com>",
      from: "PesanPro <no-reply@example.com>",
      to: "user@example.com",
      text: "Paket Anda aktif.",
      attachment: [{ data: "<p>Paket Anda aktif.</p>", alternative: true, type: "text/html" }],
    }));
    expect(smtp.close).toHaveBeenCalledOnce();
  });

  it("returns a safe error without leaking the SMTP provider response", async () => {
    smtp.sendAsync.mockRejectedValue(new Error("535 private-password is invalid"));

    await expect(sendSmtpEmail(email)).rejects.toMatchObject({
      code: "SMTP_DELIVERY_FAILED",
      message: "SMTP delivery failed",
    });
    expect(smtp.close).toHaveBeenCalledOnce();
  });
});
