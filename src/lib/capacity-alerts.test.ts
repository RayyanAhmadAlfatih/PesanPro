import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";

/**
 * Simulasi pemakaian VPS 80% tanpa menyentuh mesin atau SMTP sungguhan:
 * snapshot RAM dibuat 85%, dan prisma/email outbox dimock. Yang diuji adalah
 * keputusan "kirim / jangan kirim" serta isi email yang akan dikirim worker.
 */
const mocks = vi.hoisted(() => ({
  systemConfigFindUnique: vi.fn(),
  subscriptionCount: vi.fn(),
  userFindMany: vi.fn(),
  emailOutboxCreateMany: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    systemConfig: { findUnique: mocks.systemConfigFindUnique },
    subscription: { count: mocks.subscriptionCount },
    user: { findMany: mocks.userFindMany },
    emailOutbox: { createMany: mocks.emailOutboxCreateMany },
  },
}));
vi.mock("./operations", () => ({ collectOperationalSnapshot: vi.fn() }));

import { maybeQueueCapacityAlert } from "./capacity-alerts";

const GIG = 1024 ** 3;

function snapshot(ramUsedGb: number) {
  return {
    resources: {
      cpuPercent: 30,
      memory: {
        totalBytes: String(4 * GIG),
        usedBytes: String(ramUsedGb * GIG),
        usePercent: ramUsedGb / 4 * 100,
      },
      disks: [{ mount: "/", usePercent: 40, usedBytes: String(20 * GIG), sizeBytes: String(80 * GIG) }],
    },
    business: { devices: { total: 5, connected: 4 }, sentMessages: 10000 },
  } as never;
}

describe("email peringatan kapasitas VPS", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("APP_NAME", "PesanPro");
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    vi.stubEnv("TZ", "Asia/Jakarta");
    _resetEnvCache();
    vi.clearAllMocks();
    mocks.systemConfigFindUnique.mockResolvedValue({ capacityLimits: null });
    mocks.subscriptionCount.mockResolvedValue(5);
    mocks.userFindMany.mockResolvedValue([{ id: "admin-1", name: "Rayyan", email: "owner@example.com" }]);
    mocks.emailOutboxCreateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("mengantre satu email ke SuperAdmin saat pemakaian 85%", async () => {
    const queued = await maybeQueueCapacityAlert({
      snapshot: snapshot(3.4),
      now: new Date("2026-11-15T03:30:00.000Z"),
    });
    expect(queued).toBe(1);
    expect(mocks.emailOutboxCreateMany).toHaveBeenCalledTimes(1);
    const call = mocks.emailOutboxCreateMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    const email = call.data[0];
    expect(email.type).toBe("CAPACITY_ALERT");
    expect(email.toEmail).toBe("owner@example.com");
    expect(email.subject).toContain("85.0%");
    expect(email.textBody).toContain("Waktu:");
    expect(email.textBody).toContain("Pemakaian VPS: 85.0%");
    expect(email.textBody).toContain("Bagian paling penuh (RAM/CPU/disk): RAM 85%");
    expect(email.textBody).toMatch(/Kira-kira (masih muat \d+ tenant lagi|sisa kapasitas tenant: belum bisa dihitung)/);
    expect(email.eventKey).toMatch(/^capacity-alert:\d{8}:admin-1$/);
  });

  it("tidak mengirim email saat pemakaian turun di bawah 80%", async () => {
    const queued = await maybeQueueCapacityAlert({
      snapshot: snapshot(2),
      now: new Date("2026-11-15T04:30:00.000Z"),
    });
    expect(queued).toBe(0);
    expect(mocks.emailOutboxCreateMany).not.toHaveBeenCalled();
  });

  it("satu email per hari: jam berbeda di hari sama terduplikasi, hari berikutnya eventKey baru", async () => {
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-15T03:05:00.000Z") });
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-15T03:55:00.000Z") });
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-15T04:05:00.000Z") });
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-16T04:05:00.000Z") });
    const keys = mocks.emailOutboxCreateMany.mock.calls.map((call) => call[0].data[0].eventKey as string);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[1]).toBe(keys[2]);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it("mengirim hanya ke satu alamat ops, bukan ke semua SuperAdmin", async () => {
    mocks.userFindMany.mockResolvedValue([
      { id: "admin-1", name: "PesanPro", email: "pesanpro@kingofcoding.my.id" },
      { id: "admin-2", name: "Rayyan", email: "rayyan@kingofcoding.my.id" },
    ]);
    vi.stubEnv("CAPACITY_ALERT_EMAIL", "pesanpro@kingofcoding.my.id");
    _resetEnvCache();
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-15T03:30:00.000Z") });
    expect(mocks.emailOutboxCreateMany).toHaveBeenCalledTimes(1);
    const data = mocks.emailOutboxCreateMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0].toEmail).toBe("pesanpro@kingofcoding.my.id");
  });

  it("tanpa alamat ops, tetap satu penerima (SuperAdmin pertama)", async () => {
    mocks.userFindMany.mockResolvedValue([
      { id: "admin-1", name: "PesanPro", email: "pesanpro@kingofcoding.my.id" },
      { id: "admin-2", name: "Rayyan", email: "rayyan@kingofcoding.my.id" },
    ]);
    await maybeQueueCapacityAlert({ snapshot: snapshot(3.4), now: new Date("2026-11-15T03:30:00.000Z") });
    const data = mocks.emailOutboxCreateMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0].toEmail).toBe("pesanpro@kingofcoding.my.id");
  });
});
