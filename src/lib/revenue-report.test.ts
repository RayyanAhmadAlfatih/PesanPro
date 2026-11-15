import { describe, expect, it } from "vitest";
import {
  buildRevenueSeries,
  filterApprovedPayments,
  filterPendingPayments,
  resolveRevenuePeriod,
  summarizeRevenue,
} from "./revenue-report";

describe("laporan pemasukan", () => {
  const now = new Date("2026-11-15T10:00:00.000Z");
  const payments = [
    { amount: "20000", discountAmount: "0", reviewedAt: new Date("2026-11-01T03:00:00.000Z"), createdAt: new Date("2026-11-01T02:00:00.000Z"), status: "APPROVED", planCode: "STARTER", planName: "Starter" },
    { amount: "49000", discountAmount: "9800", reviewedAt: new Date("2026-11-02T03:00:00.000Z"), createdAt: new Date("2026-11-02T02:00:00.000Z"), status: "APPROVED", planCode: "BISNIS", planName: "Bisnis" },
    { amount: "99000", discountAmount: "0", reviewedAt: new Date("2026-10-10T03:00:00.000Z"), createdAt: new Date("2026-10-10T02:00:00.000Z"), status: "APPROVED", planCode: "PRO", planName: "Pro" },
    { amount: "50000", discountAmount: "0", reviewedAt: null, createdAt: new Date("2026-11-03T02:00:00.000Z"), status: "PENDING", planCode: "BISNIS", planName: "Bisnis" },
  ];

  it("membatasi periode bulan berjalan pada WIB dan menampilkan rumus promo", () => {
    const period = resolveRevenuePeriod({ preset: "THIS_MONTH", now });
    const summary = summarizeRevenue({ payments, period, infraCostIdr: "90000" });
    expect(summary.paymentCount).toBe(2);
    expect(summary.gross).toBe(69000);
    expect(summary.discountTotal).toBe(9800);
    expect(summary.beforeDiscount).toBe(78800);
    expect(summary.beforeDiscount - summary.discountTotal).toBe(summary.gross);
    expect(summary.infraCost).toBe(90000);
    expect(summary.net).toBe(-21000);
    expect(summary.gross - summary.infraCost).toBe(summary.net);
  });

  it("PENDING masuk ke 'semua yang masuk' tapi bukan pemasukan disetujui", () => {
    const period = resolveRevenuePeriod({ preset: "THIS_MONTH", now });
    expect(filterApprovedPayments(payments, period)).toHaveLength(2);
    expect(filterPendingPayments(payments, period)).toHaveLength(1);
    const summary = summarizeRevenue({ payments, period, infraCostIdr: "90000" });
    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingTotal).toBe(50000);
    expect(summary.allIncomingTotal).toBe(119000);
    expect(summary.gross).toBe(69000);
    expect(summary.byPlan.every((row) => row.gross <= summary.gross)).toBe(true);
  });

  it("memisah pemasukan per paket Starter, Bisnis, Pro", () => {
    const period = resolveRevenuePeriod({ preset: "ALL_TIME", now });
    const summary = summarizeRevenue({ payments, period, infraCostIdr: "90000" });
    expect(summary.byPlan.map((row) => row.planCode)).toEqual(["STARTER", "BISNIS", "PRO"]);
    expect(summary.byPlan.find((row) => row.planCode === "BISNIS")).toMatchObject({ count: 1, gross: 49000, discount: 9800, beforeDiscount: 58800 });
  });

  it("menyediakan empat periode wajib: minggu ini, bulan ini, 30 hari, semua waktu", () => {
    const week = resolveRevenuePeriod({ preset: "THIS_WEEK", now });
    expect(week.label).toBe("Minggu ini");
    expect(week.start.getTime()).toBeLessThan(now.getTime());
    expect(week.end.getTime()).toBeGreaterThan(now.getTime());

    const month = resolveRevenuePeriod({ preset: "THIS_MONTH", now });
    expect(month.label).toBe("Bulan ini");

    const last30 = resolveRevenuePeriod({ preset: "LAST_30_DAYS", now });
    expect(last30.label).toBe("30 hari terakhir");
    expect(Math.round((last30.end.getTime() - last30.start.getTime()) / 86_400_000)).toBe(30);

    const all = resolveRevenuePeriod({ preset: "ALL_TIME", now });
    expect(all.label).toBe("Semua waktu sejak awal");
    expect(all.start.getTime()).toBe(0);
    expect(summarizeRevenue({ payments, period: all, infraCostIdr: "100000" }).gross).toBe(168000);
  });

  it("biaya VPS yang diubah langsung mengubah pemasukan bersih", () => {
    const period = resolveRevenuePeriod({ preset: "THIS_MONTH", now });
    expect(summarizeRevenue({ payments, period, infraCostIdr: "90000" }).net).toBe(-21000);
    expect(summarizeRevenue({ payments, period, infraCostIdr: "100000" }).net).toBe(-31000);
  });

  it("memakai periode kustom dan mengabaikan pembayaran non-APPROVED", () => {
    const period = resolveRevenuePeriod({ preset: "CUSTOM", from: "2026-10-01", to: "2026-10-31", now });
    const summary = summarizeRevenue({ payments, period, infraCostIdr: "90000" });
    expect(summary.paymentCount).toBe(1);
    expect(summary.gross).toBe(99000);
  });

  it("menyediakan grafik harian dan bulanan sekaligus", () => {
    const period = resolveRevenuePeriod({ preset: "CUSTOM", from: "2026-09-01", to: "2026-11-30", now });
    const summary = summarizeRevenue({ payments, period, infraCostIdr: "90000" });
    expect(summary.dailySeries.map((point) => point.amount)).toEqual([99000, 20000, 49000]);
    expect(summary.monthlySeries.map((point) => point.key)).toEqual(["2026-10", "2026-11"]);
    expect(summary.monthlySeries.find((point) => point.key === "2026-11")?.amount).toBe(69000);
    expect(buildRevenueSeries(payments, period, "daily")).toHaveLength(3);
    expect(buildRevenueSeries(payments, period, "monthly")).toHaveLength(2);
  });
});
