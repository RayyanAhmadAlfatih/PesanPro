import { describe, expect, it } from "vitest";
import {
  capacityStatusLevel,
  effectiveCapacityLimits,
  evaluateCapacity,
  parseCapacityLimits,
  proratedVpsCost,
  type CapacityUsageInput,
} from "./capacity";

const live: CapacityUsageInput = {
  cpuCores: 2,
  cpuPercent: 40,
  ramTotalBytes: String(4 * 1024 ** 3),
  ramUsedBytes: String(2 * 1024 ** 3),
  diskTotalBytes: String(80 * 1024 ** 3),
  diskUsedBytes: String(20 * 1024 ** 3),
  diskUsePercent: 25,
  waSessions: 5,
  monthlyMessages: 10000,
  tenants: 5,
};

const savedAll = {
  cpuCores: 2,
  ramBytes: String(4 * 1024 ** 3),
  diskBytes: String(80 * 1024 ** 3),
  waSessions: 10,
  monthlyMessages: "20000",
};

describe("capacity", () => {
  it("hanya memakai pengukuran fisik untuk CPU/RAM/disk, bukan menebak batas sesi dan pesan", () => {
    const limits = effectiveCapacityLimits(live, {});
    expect(limits.cpuCores).toBe(2);
    expect(limits.ramBytes).toBe(String(4 * 1024 ** 3));
    expect(limits.diskBytes).toBe(String(80 * 1024 ** 3));
    expect(limits.waSessions).toBeNull();
    expect(limits.monthlyMessages).toBeNull();
  });

  it("menghitung sisa tenant dari bound paling sempit", () => {
    const report = evaluateCapacity(live, savedAll);
    expect(report.tenants).toBe(5);
    // RAM: (4-2) GB / 0.4 GB per tenant = 5; sesi: (10-5)/1 = 5.
    expect(report.remainingTenants).toBe(5);
    expect(report.fullest).toBe("RAM");
    expect(report.statusLevel).toBe("ok");
  });

  it("menandai kapasitas kritis dan tidak menghitung bila belum ada tenant", () => {
    const critical = evaluateCapacity({ ...live, ramUsedBytes: String(3.8 * 1024 ** 3) }, { ramBytes: String(4 * 1024 ** 3) });
    expect(critical.statusLevel).toBe("critical");
    const empty = evaluateCapacity({ ...live, tenants: 0 }, {});
    expect(empty.remainingTenants).toBeNull();
    expect(empty.bounds.every((bound) => !bound.available)).toBe(true);
  });

  it("warna status VPS: hijau <70%, kuning 70-90%, merah >90%", () => {
    expect(capacityStatusLevel(0)).toBe("ok");
    expect(capacityStatusLevel(69.9)).toBe("ok");
    expect(capacityStatusLevel(70)).toBe("warning");
    expect(capacityStatusLevel(89.9)).toBe("warning");
    expect(capacityStatusLevel(90)).toBe("warning");
    expect(capacityStatusLevel(90.1)).toBe("critical");
    expect(capacityStatusLevel(100)).toBe("critical");
    expect(capacityStatusLevel(Number.NaN)).toBe("unknown");
  });

  it("menulis 'belum bisa dihitung' beserta alasan saat batas sesi/pesan belum diisi", () => {
    const report = evaluateCapacity(live, {});
    expect(report.missingLimits).toContain("SESSIONS");
    expect(report.missingLimits).toContain("MESSAGES");
    expect(report.bounds.find((item) => item.key === "SESSIONS")?.reason).toContain("belum diisi");
    expect(report.bounds.find((item) => item.key === "MESSAGES")?.reason).toContain("belum diisi");
    expect(report.note).toContain("Belum bisa dihitung");
    // Angka tenant tetap berasal dari bound yang benar-benar terukur.
    expect(report.remainingTenants).toBe(5);
    expect(report.fullestResource).toBe("RAM");
  });

  it("menyediakan angka dasar rata-rata pemakaian per tenant", () => {
    const report = evaluateCapacity(live, savedAll);
    expect(report.bounds.find((item) => item.key === "RAM")?.avgPerTenant).toBeCloseTo(2 * 1024 ** 3 / 5);
    expect(report.bounds.find((item) => item.key === "SESSIONS")?.avgPerTenant).toBe(1);
  });

  it("membaca batas JSON dengan aman dan mengabaikan nilai rusak", () => {
    expect(parseCapacityLimits({ cpuCores: 4, ramBytes: "8589934592", waSessions: "bukan angka" })).toEqual({
      cpuCores: 4,
      ramBytes: "8589934592",
      diskBytes: null,
      waSessions: null,
      monthlyMessages: null,
    });
    expect(parseCapacityLimits(null)).toEqual({});
  });

  it("memprorata biaya VPS per hari", () => {
    expect(proratedVpsCost(90000, 30)).toBe(90000);
    expect(proratedVpsCost(90000, 15)).toBe(45000);
  });
});
