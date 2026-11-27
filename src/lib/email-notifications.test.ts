import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import {
  buildPaymentApprovedEmail,
  buildPaymentSubmittedEmail,
  buildPaymentSubmittedUserEmail,
  buildSubscriptionReminderEmail,
  queuePaymentSubmittedEmails,
  queuePaymentSubmittedUserEmail,
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

  it("tells the user the proof arrived and is being reviewed", () => {
    const email = buildPaymentSubmittedUserEmail({
      verificationId: "payment-1",
      userName: "Raka",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-11-26T02:00:00.000Z"),
    });

    expect(email.subject).toBe("Bukti pembayaran Pro sudah kami terima");
    expect(email.textBody).toContain("Halo Raka,");
    expect(email.textBody).toContain("tidak perlu mengunggah ulang");
    expect(email.textBody).toContain("Status: menunggu pemeriksaan admin");
    expect(email.textBody).toContain("Lihat status: https://pesanpro.example.com/dashboard/billing");
    expect(`${email.subject}${email.textBody}${email.htmlBody}`).not.toContain("—");
  });

  it("queues the user confirmation once per payment verification", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue({ name: "Raka", email: "raka@example.com" }), findMany: vi.fn() },
      emailOutbox: { createMany },
    };

    await expect(queuePaymentSubmittedUserEmail(client as never, {
      verificationId: "payment-1",
      userId: "user-1",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-11-26T02:00:00.000Z"),
    })).resolves.toBe(1);

    const call = createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      eventKey: "payment-submitted-user:payment-1:user-1",
      type: "PAYMENT_SUBMITTED_USER",
      toEmail: "raka@example.com",
      toName: "Raka",
    });
  });

  it("tidak mengantre apa pun kalau user penerima tidak ditemukan", async () => {
    const createMany = vi.fn();
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      emailOutbox: { createMany },
    };

    await expect(queuePaymentSubmittedUserEmail(client as never, {
      verificationId: "payment-1",
      userId: "user-hilang",
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
      submittedAt: new Date("2026-11-26T02:00:00.000Z"),
    })).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("mengingatkan H-3 dengan sisa waktu dan tautan perpanjangan", () => {
    const email = buildSubscriptionReminderEmail({
      userName: "Raka",
      planName: "Pro",
      endsAt: new Date("2026-11-29T16:00:00.000Z"),
      stage: "h3",
    });

    expect(email.subject).toBe("Paket Pro berakhir 3 hari lagi");
    expect(email.textBody).toContain("Sisa waktu: 3 hari");
    expect(email.textBody).toContain("harga paket Anda yang terkunci");
    expect(email.textBody).toContain("Perpanjang di halaman Tagihan: https://pesanpro.example.com/dashboard/billing");
  });
});
