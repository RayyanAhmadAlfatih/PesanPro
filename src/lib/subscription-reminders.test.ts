import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";

/**
 * Simulasi job pengingat tanpa database dan tanpa SMTP: prisma diganti objek
 * palsu, dan EmailOutbox palsu menegakkan `eventKey` unik seperti MySQL
 * (`skipDuplicates`). Dengan begitu tes bisa membuktikan pengingat yang sama
 * mustahil terkirim dua kali, bukan hanya "createMany dipanggil dua kali".
 */
type OutboxRow = { eventKey: string; type: string; toEmail: string; subject: string; textBody: string };

const mocks = vi.hoisted(() => {
  const outbox: OutboxRow[] = [];
  const users = new Map<string, { id: string; name: string | null; email: string; role: string; status: string }>();
  return {
    outbox,
    users,
    subscriptionFindMany: vi.fn(),
    paymentVerificationFindMany: vi.fn(),
    userFindMany: vi.fn(),
    createMany: vi.fn(),
  };
});

vi.mock("./prisma", () => ({
  prisma: {
    subscription: { findMany: mocks.subscriptionFindMany },
    paymentVerification: { findMany: mocks.paymentVerificationFindMany },
    user: { findMany: mocks.userFindMany },
    emailOutbox: { createMany: mocks.createMany },
  },
}));

import {
  buildSubscriptionReminderAdminEmail,
  buildSubscriptionReminderEmail,
} from "./email-notifications";
import {
  isReminderSendWindow,
  reminderDateKey,
  reminderStageFor,
  runSubscriptionReminders,
} from "./subscription-reminders";

const TZ = "Asia/Jakarta";

/** 09:00 WIB tanggal 26 November 2026. */
const NOW = new Date("2026-11-26T02:00:00.000Z");

function daysFromNow(days: number) {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function subscriptionRow(input: {
  userId: string;
  endsAt: Date | null;
  status?: "ACTIVE" | "TRIAL" | "GRACE_PERIOD" | "EXPIRED";
  graceEndsAt?: Date | null;
  pending?: { amount: string; reference: string } | null;
}) {
  mocks.paymentVerificationFindMany.mockResolvedValue(
    input.pending
      ? [{
        userId: input.userId,
        amount: input.pending.amount,
        currency: "IDR",
        reference: input.pending.reference,
        createdAt: new Date("2026-11-26T01:00:00.000Z"),
      }]
      : [],
  );
  return {
    userId: input.userId,
    status: input.status ?? "ACTIVE",
    trialEndsAt: null,
    endsAt: input.endsAt,
    graceEndsAt: input.graceEndsAt ?? null,
    plan: { name: "Pro" },
  };
}

describe("helper pengingat paket berakhir", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", TZ);
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("menghitung tahap dari tanggal kalender, bukan selisih jam", () => {
    // Berakhir 23:30 WIB tanggal 29 = H-3 walau hanya ~62 jam lagi.
    expect(reminderStageFor(new Date("2026-11-29T16:30:00.000Z"), NOW, TZ)).toBe("h3");
    // Berakhir 00:30 WIB tanggal 28 = H-2, bukan H-3 walau jamnya dekat.
    expect(reminderStageFor(new Date("2026-11-27T17:30:00.000Z"), NOW, TZ)).toBeNull();
    expect(reminderStageFor(new Date("2026-11-27T16:00:00.000Z"), NOW, TZ)).toBe("h1");
    expect(reminderStageFor(daysFromNow(20), NOW, TZ)).toBeNull();
    expect(reminderStageFor(new Date("2026-11-25T02:00:00.000Z"), NOW, TZ)).toBeNull();
  });

  it("memakai kunci tanggal zona aplikasi", () => {
    expect(reminderDateKey(NOW, TZ)).toBe("2026-11-26");
    // 17:30 UTC tanggal 25 sudah tanggal 26 di Jakarta.
    expect(reminderDateKey(new Date("2026-11-25T17:30:00.000Z"), TZ)).toBe("2026-11-26");
  });

  it("hanya mengirim pada jendela 09.00 sampai 20.59 waktu aplikasi", () => {
    expect(isReminderSendWindow(new Date("2026-11-26T01:59:00.000Z"), TZ)).toBe(false); // 08:59
    expect(isReminderSendWindow(new Date("2026-11-26T02:00:00.000Z"), TZ)).toBe(true); // 09:00
    expect(isReminderSendWindow(new Date("2026-11-26T13:59:00.000Z"), TZ)).toBe(true); // 20:59
    expect(isReminderSendWindow(new Date("2026-11-26T14:00:00.000Z"), TZ)).toBe(false); // 21:00
  });
});

describe("runSubscriptionReminders", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", TZ);
    _resetEnvCache();
    vi.clearAllMocks();
    mocks.outbox.length = 0;
    mocks.users.clear();
    mocks.users.set("user-1", { id: "user-1", name: "Raka", email: "raka@example.com", role: "USER", status: "ACTIVE" });
    mocks.userFindMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      const all = [...mocks.users.values()];
      if (args?.where?.role === "SUPERADMIN") {
        return [
          { id: "admin-1", name: "PesanPro", email: "owner@example.com" },
          { id: "admin-2", name: "Rayyan", email: "rayyan@example.com" },
        ];
      }
      return all.filter((user) => user.role === "USER").map(({ id, name, email }) => ({ id, name, email }));
    });
    mocks.paymentVerificationFindMany.mockResolvedValue([]);
    // EmailOutbox palsu: eventKey unik, seperti indeks unik MySQL.
    mocks.createMany.mockImplementation(async (args: { data: OutboxRow[] }) => {
      let count = 0;
      for (const row of args.data) {
        if (mocks.outbox.some((existing) => existing.eventKey === row.eventKey)) continue;
        mocks.outbox.push(row);
        count += 1;
      }
      return { count };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("mengantre pengingat H-3 ke user saat paket berakhir 3 hari lagi", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ userId: "user-1", endsAt: daysFromNow(3) })]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(1);

    expect(mocks.outbox).toHaveLength(1);
    const email = mocks.outbox[0];
    expect(email.type).toBe("SUBSCRIPTION_REMINDER");
    expect(email.toEmail).toBe("raka@example.com");
    expect(email.eventKey).toBe("subscription-reminder:h3:user:user-1:2026-11-29");
    expect(email.subject).toContain("berakhir 3 hari lagi");
    expect(email.textBody).toContain("Paket: Pro");
    expect(email.textBody).toContain("Berakhir: 29 November 2026");
  });

  it("tidak mengirim apa pun kalau user sudah memperpanjang", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ userId: "user-1", endsAt: daysFromNow(20) })]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.outbox).toHaveLength(0);
  });

  it("H-1 dengan bukti perpanjangan menunggu dikirim ke admin, bukan ke user", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([
      subscriptionRow({
        userId: "user-1",
        endsAt: daysFromNow(1),
        pending: { amount: "100000", reference: "BANK-002" },
      }),
    ]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(2);

    expect(mocks.outbox).toHaveLength(2);
    expect(mocks.outbox.every((row) => row.type === "SUBSCRIPTION_REMINDER_ADMIN")).toBe(true);
    expect(mocks.outbox.map((row) => row.toEmail).sort()).toEqual(["owner@example.com", "rayyan@example.com"]);
    expect(mocks.outbox.map((row) => row.eventKey).sort()).toEqual([
      "subscription-reminder-admin:h1:user:user-1:2026-11-27:admin-1",
      "subscription-reminder-admin:h1:user:user-1:2026-11-27:admin-2",
    ]);
    expect(mocks.outbox[0].subject).toContain("menunggu");
    expect(mocks.outbox[0].textBody).toContain("Referensi: BANK-002");
    // Tidak ada email ke user pada tahap ini.
    expect(mocks.outbox.some((row) => row.toEmail === "raka@example.com")).toBe(false);
  });

  it("H-3 dengan bukti menunggu juga dialihkan ke admin", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([
      subscriptionRow({
        userId: "user-1",
        endsAt: daysFromNow(3),
        pending: { amount: "100000", reference: "BANK-003" },
      }),
    ]);

    await runSubscriptionReminders(NOW, TZ);
    expect(mocks.outbox.every((row) => row.type === "SUBSCRIPTION_REMINDER_ADMIN")).toBe(true);
  });

  it("menjalankan dua kali di hari yang sama tidak menggandakan email", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ userId: "user-1", endsAt: daysFromNow(3) })]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(1);
    // 13:00 WIB, hari yang sama, tanggal berakhir sama.
    await expect(runSubscriptionReminders(new Date("2026-11-26T06:00:00.000Z"), TZ)).resolves.toBe(0);

    expect(mocks.outbox).toHaveLength(1);
    expect(mocks.createMany).toHaveBeenCalledTimes(2);
  });

  it("akun PENDING tanpa tanggal berakhir tidak dikirimi pengingat", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ userId: "user-1", endsAt: null })]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("melewati langganan yang status turunannya bukan ACTIVE", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([
      subscriptionRow({ userId: "user-1", endsAt: daysFromNow(1), status: "GRACE_PERIOD", graceEndsAt: null }),
    ]);

    await expect(runSubscriptionReminders(NOW, TZ)).resolves.toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("tidak menyentuh database di luar jendela kirim", async () => {
    mocks.subscriptionFindMany.mockResolvedValue([subscriptionRow({ userId: "user-1", endsAt: daysFromNow(3) })]);

    // 22:00 WIB.
    await expect(runSubscriptionReminders(new Date("2026-11-26T15:00:00.000Z"), TZ)).resolves.toBe(0);
    expect(mocks.subscriptionFindMany).not.toHaveBeenCalled();
  });
});

describe("isi email pengingat", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", TZ);
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("mengingatkan H-1 tanpa dasbor kalau BASE_URL kosong", () => {
    vi.stubEnv("BASE_URL", "");
    _resetEnvCache();

    const email = buildSubscriptionReminderEmail({
      userName: null,
      planName: "Pro",
      endsAt: new Date("2026-11-27T02:00:00.000Z"),
      stage: "h1",
    });

    expect(email.subject).toBe("Paket Pro berakhir besok");
    expect(email.textBody).toContain("Halo,");
    expect(email.textBody).not.toContain("http");
  });

  it("email admin menyebut pengguna, nominal, dan tautan pemeriksaan", () => {
    const email = buildSubscriptionReminderAdminEmail({
      userName: "Raka",
      userEmail: "raka@example.com",
      planName: "Pro",
      endsAt: new Date("2026-11-27T02:00:00.000Z"),
      stage: "h1",
      pending: {
        amount: "100000",
        currency: "IDR",
        reference: "BANK-002",
        submittedAt: new Date("2026-11-26T01:00:00.000Z"),
      },
    });

    expect(email.subject).toBe("Perpanjangan Raka menunggu, paket berakhir besok");
    expect(email.textBody).toContain("Pengguna: Raka (raka@example.com)");
    expect(email.textBody).toContain("Periksa pembayaran: https://pesanpro.example.com/dashboard/commercial");
    expect(email.htmlBody).toContain("Rp");
  });
});
