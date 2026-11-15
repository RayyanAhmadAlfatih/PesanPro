import { describe, expect, it } from "vitest";
import { normalizePromoInput } from "./promo-input";

const base = {
  name: "Diskon Akhir Tahun",
  kind: "PERCENT",
  percent: "20",
  enabled: true,
  billingScope: "BOTH",
  plans: [{ planId: "plan-bisnis", fixedPrice: null }],
};

describe("normalizePromoInput", () => {
  it("menerima promo persen dan menormalkan tanggal", () => {
    const result = normalizePromoInput({
      ...base,
      startsAt: "2026-11-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.percent).toBe("20");
      expect(result.data.startsAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(result.data.code).toBeNull();
    }
  });

  it("mewajibkan kode voucher dan mengubahnya menjadi huruf besar", () => {
    const result = normalizePromoInput({
      ...base,
      kind: "VOUCHER",
      code: "hemat20",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.code).toBe("HEMAT20");
    const missing = normalizePromoInput({ ...base, kind: "VOUCHER", code: null });
    expect(missing.ok).toBe(false);
  });

  it("mewajibkan harga akhir untuk semua paket pada promo harga tetap", () => {
    const missing = normalizePromoInput({
      ...base,
      kind: "FIXED",
      percent: null,
      plans: [
        { planId: "plan-starter", fixedPrice: "15000" },
        { planId: "plan-bisnis", fixedPrice: null },
      ],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join(" ")).toContain("setiap paket");
  });

  it("menolak rentang tanggal terbalik dan persen di luar 0-100", () => {
    const reversed = normalizePromoInput({
      ...base,
      startsAt: "2026-12-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    });
    expect(reversed.ok).toBe(false);
    const tooLarge = normalizePromoInput({ ...base, percent: "120" });
    expect(tooLarge.ok).toBe(false);
  });

  it("menolak paket dobel", () => {
    const result = normalizePromoInput({
      ...base,
      plans: [
        { planId: "plan-bisnis", fixedPrice: null },
        { planId: "plan-bisnis", fixedPrice: null },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
