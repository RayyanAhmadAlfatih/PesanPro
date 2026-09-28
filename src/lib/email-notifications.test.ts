import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import {
  buildPaymentApprovedEmail,
  buildPasswordResetEmail,
  buildPaymentSubmittedEmail,
  queuePaymentSubmittedEmails,
} from "./email-notifications";

describe("payment email notifications", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", "Asia/Jakarta");
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("builds a concise admin email from real payment data", () => {
    const email = buildPaymentSubmittedEmail({
      verificationId: "payment-1",
      payerName: "Nadia <Admin>",
      payerEmail: "nadia@example.com",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-09-27T00:00:00.000Z"),
    });

    expect(email.subject).toBe("Bukti pembayaran baru dari Nadia <Admin>");
    expect(email.textBody).toContain("Periksa pembayaran: https://pesanpro.example.com/dashboard/commercial");
    expect(email.htmlBody).toContain("Nadia &lt;Admin&gt;");
    expect(`${email.subject}${email.textBody}${email.htmlBody}`).not.toContain("—");
  });

  it("keeps user-controlled values out of additional subject headers", () => {
    const email = buildPaymentSubmittedEmail({
      verificationId: "payment-1",
      payerName: "Nadia\r\nBcc: attacker@example.com",
      payerEmail: "nadia@example.com",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-09-27T00:00:00.000Z"),
    });

    expect(email.subject).toBe("Bukti pembayaran baru dari Nadia Bcc: attacker@example.com");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("tells the user the approved plan is active", () => {
    const email = buildPaymentApprovedEmail({
      verificationId: "payment-1",
      userName: "Raka",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      approvedAt: new Date("2026-09-27T00:00:00.000Z"),
      activeUntil: new Date("2026-10-27T00:00:00.000Z"),
    });

    expect(email.subject).toBe("Pembayaran dikonfirmasi, paket Pro aktif");
    expect(email.textBody).toContain("Paket tersebut sudah aktif dan dapat digunakan sampai");
    expect(email.textBody).toContain("Buka dashboard: https://pesanpro.example.com/dashboard");
  });

  it("queues one idempotent notification for every active superadmin", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const client = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ name: "Raka", email: "raka@example.com" }),
        findMany: vi.fn().mockResolvedValue([
          { id: "admin-1", name: "Admin One", email: "admin1@example.com" },
          { id: "admin-2", name: null, email: "admin2@example.com" },
        ]),
      },
      emailOutbox: { createMany },
    };

    await expect(queuePaymentSubmittedEmails(client as never, {
      verificationId: "payment-1",
      payerId: "user-1",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-09-27T00:00:00.000Z"),
    })).resolves.toBe(2);

    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ eventKey: "payment-submitted:payment-1:admin-1", toEmail: "admin1@example.com" }),
        expect.objectContaining({ eventKey: "payment-submitted:payment-1:admin-2", toEmail: "admin2@example.com" }),
      ]),
      skipDuplicates: true,
    });
  });
});

describe("password reset email template", () => {
  const resetUrl = "https://pesanpro.example.com/auth/reset-password?token=secret-token";

  it("uses the exact subject and carries the reset URL in both bodies", () => {
    const email = buildPasswordResetEmail({ userName: "Raka", resetUrl });

    expect(email.subject).toBe("Atur ulang kata sandi PesanPro");
    expect(email.textBody).toContain(`Buka tautan berikut untuk membuat kata sandi baru:\n${resetUrl}`);
    expect(email.htmlBody).toContain(`href="${resetUrl}"`);
    expect(email.htmlBody).toContain(resetUrl);
  });

  it("greets the user by name, falling back to a nameless greeting", () => {
    const named = buildPasswordResetEmail({ userName: "  Raka  ", resetUrl });
    const unnamed = buildPasswordResetEmail({ userName: null, resetUrl });

    expect(named.htmlBody).toContain("Halo Raka,");
    expect(named.textBody).toContain("Halo Raka,");
    expect(unnamed.htmlBody).toContain("Halo,");
    expect(unnamed.textBody).toContain("Halo,");
    expect(unnamed.textBody).not.toContain("Halo null");
  });

  it("escapes the user name in HTML but keeps it readable in plain text", () => {
    const name = `Ana <Admin> & "Co"`;
    const email = buildPasswordResetEmail({ userName: name, resetUrl });

    expect(email.htmlBody).toContain("Halo Ana &lt;Admin&gt; &amp; &quot;Co&quot;,");
    expect(email.htmlBody).not.toContain(name);
    expect(email.textBody).toContain(`Halo ${name},`);
  });

  it("states the 30-minute expiry, one-time use, and the ignore-if-unsolicited note", () => {
    const email = buildPasswordResetEmail({ userName: null, resetUrl });
    const combined = `${email.textBody}\n${email.htmlBody}`;

    expect(combined).toContain("Tautan ini berlaku selama 30 menit.");
    expect(combined).toContain("Tautan ini berlaku selama 30 menit dan hanya dapat digunakan satu kali.");
    expect(combined).toContain("Jika Anda tidak meminta reset kata sandi, abaikan email ini. Tidak ada perubahan yang dilakukan pada akun Anda.");
    expect(combined).toContain("Atur ulang kata sandi");
    expect(combined).toContain("Jika tombol tidak berfungsi, salin dan buka tautan berikut di browser:");
    expect(combined).toContain("Email ini dikirim otomatis oleh PesanPro. Mohon jangan membalas email ini.");
  });
});
