import { describe, expect, it } from "vitest";
import {
  calculatePromoDiscount,
  isFirstPurchaseEligible,
  isPromoActive,
  jakartaDayStart,
  jakartaMonthStart,
  parseJakartaDate,
  promoFixedPriceError,
  quoteCyclePrice,
  selectBestAutoPromo,
  selectVoucher,
  type PromoValue,
} from "./promo-pricing";

const basePromo: PromoValue = {
  id: "promo-1",
  name: "Diskon 20%",
  kind: "PERCENT",
  percent: "20",
  code: null,
  enabled: true,
  startsAt: null,
  endsAt: null,
  usageLimitTotal: null,
  usageLimitPerUser: null,
  billingScope: "BOTH",
  plans: [{ planId: "plan-bisnis", fixedPrice: null }],
};

describe("promo pricing", () => {
  it("menghitung potongan persen dan harga akhir", () => {
    const result = calculatePromoDiscount({ promo: basePromo, planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000 });
    expect(result).toMatchObject({ eligible: true, discount: 9800, finalAmount: 39200 });
  });

  it("menolak promo untuk paket atau siklus yang tidak cocok", () => {
    expect(calculatePromoDiscount({ promo: basePromo, planId: "plan-pro", cycle: "MONTHLY", amount: 99000 }).eligible).toBe(false);
    const yearlyOnly = { ...basePromo, billingScope: "YEARLY" as const };
    expect(calculatePromoDiscount({ promo: yearlyOnly, planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000 }).eligible).toBe(false);
  });

  it("memakai harga akhir tetap dan menolak harga yang bukan diskon", () => {
    const fixed: PromoValue = { ...basePromo, kind: "FIXED", percent: null, plans: [{ planId: "plan-bisnis", fixedPrice: "30000" }] };
    expect(calculatePromoDiscount({ promo: fixed, planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000 })).toMatchObject({ discount: 19000, finalAmount: 30000 });
    const tooHigh: PromoValue = { ...fixed, plans: [{ planId: "plan-bisnis", fixedPrice: "50000" }] };
    expect(calculatePromoDiscount({ promo: tooHigh, planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000 }).reason).toBe("HARGA_PROMO_TIDAK_LEBIH_RENDAH");
  });

  it("memilih promo otomatis dengan potongan terbesar", () => {
    const smaller: PromoValue = { ...basePromo, id: "promo-2", percent: "10" };
    const best = selectBestAutoPromo({ promos: [smaller, basePromo], planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000 });
    expect(best?.promo.id).toBe("promo-1");
    expect(best?.discount.discount).toBe(9800);
  });

  it("menolak voucher yang kuotanya habis atau tidak aktif", () => {
    const voucher: PromoValue = {
      ...basePromo,
      id: "voucher-1",
      kind: "VOUCHER",
      code: "HEMAT20",
      usageLimitTotal: 5,
      usageLimitPerUser: 1,
    };
    const usages = new Map([["voucher-1", { total: 5, byUser: 1 }]]);
    const result = selectVoucher({
      promos: [voucher], code: "hemat20", planId: "plan-bisnis", cycle: "MONTHLY", amount: 49000, usages,
    });
    expect(result).toEqual({ error: "KUOTA_PROMO_HABIS" });
    expect(isPromoActive({ ...voucher, startsAt: new Date(Date.now() + 86_400_000) })).toBe(false);
  });

  it("hanya mengizinkan promo untuk pembelian pertama", () => {
    expect(isFirstPurchaseEligible({ approvedPaymentCount: 0, subscriptionPlanMonthly: "0" })).toBe(true);
    expect(isFirstPurchaseEligible({ approvedPaymentCount: 1, subscriptionPlanMonthly: "0" })).toBe(false);
    expect(isFirstPurchaseEligible({ approvedPaymentCount: 0, subscriptionPlanMonthly: "49000" })).toBe(false);
  });

  it("bulan pertama bayar harga promo, bulan kedua balik ke harga normal", () => {
    const promo: PromoValue = {
      ...basePromo,
      id: "promo-starter-50",
      name: "Starter 50%",
      percent: "50",
      plans: [{ planId: "plan-starter", fixedPrice: null }],
    };
    const normal = 20000;

    // Bulan pertama: belum pernah ada pembayaran disetujui, paket masih gratis.
    const firstPurchase = isFirstPurchaseEligible({ approvedPaymentCount: 0, subscriptionPlanMonthly: "0" });
    const firstMonth = quoteCyclePrice({
      firstPurchase, normalAmount: normal, promo, planId: "plan-starter", cycle: "MONTHLY",
    });
    expect(firstMonth).toEqual({ baseAmount: 20000, discountAmount: 10000, amount: 10000 });

    // Bulan kedua: sudah ada pembayaran disetujui, harga normal terkunci dipakai.
    const secondPurchase = isFirstPurchaseEligible({ approvedPaymentCount: 1, subscriptionPlanMonthly: String(normal) });
    const secondMonth = quoteCyclePrice({
      firstPurchase: secondPurchase, normalAmount: normal, promo, planId: "plan-starter", cycle: "MONTHLY",
    });
    expect(secondMonth).toEqual({ baseAmount: 20000, discountAmount: 0, amount: 20000 });

    // Promo yang dimatikan manual tidak berlaku lagi walau tanggalnya masih jalan.
    const disabled = quoteCyclePrice({
      firstPurchase: true, normalAmount: normal, promo: { ...promo, enabled: false }, planId: "plan-starter", cycle: "MONTHLY",
    });
    expect(disabled.amount).toBe(20000);
  });
});

/**
 * Keputusan Rayyan 15 Nov 2026: promo boleh bulanan saja, tahunan saja, atau
 * keduanya — terserah SuperAdmin yang mengatur per promo.
 */
describe("pilihan siklus promo oleh SuperAdmin", () => {
  const monthly = 20000;
  const yearly = 200000;

  it("tahunan saja: bulanan tetap normal, tahunan dapat diskon, tahun kedua balik normal", () => {
    const promo: PromoValue = { ...basePromo, percent: "20", billingScope: "YEARLY" };
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: monthly, promo, planId: "plan-bisnis", cycle: "MONTHLY" }))
      .toEqual({ baseAmount: monthly, discountAmount: 0, amount: monthly });
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: yearly, promo, planId: "plan-bisnis", cycle: "YEARLY" }))
      .toEqual({ baseAmount: yearly, discountAmount: 40000, amount: 160000 });
    expect(quoteCyclePrice({ firstPurchase: false, normalAmount: yearly, promo, planId: "plan-bisnis", cycle: "YEARLY" }))
      .toEqual({ baseAmount: yearly, discountAmount: 0, amount: yearly });
  });

  it("bulanan saja: tahunan tidak berubah", () => {
    const promo: PromoValue = { ...basePromo, percent: "50", billingScope: "MONTHLY" };
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: monthly, promo, planId: "plan-bisnis", cycle: "MONTHLY" }))
      .toEqual({ baseAmount: monthly, discountAmount: 10000, amount: 10000 });
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: yearly, promo, planId: "plan-bisnis", cycle: "YEARLY" }))
      .toEqual({ baseAmount: yearly, discountAmount: 0, amount: yearly });
  });

  it("keduanya: dua-duanya dapat diskon", () => {
    const promo: PromoValue = { ...basePromo, percent: "20", billingScope: "BOTH" };
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: monthly, promo, planId: "plan-bisnis", cycle: "MONTHLY" }).amount).toBe(16000);
    expect(quoteCyclePrice({ firstPurchase: true, normalAmount: yearly, promo, planId: "plan-bisnis", cycle: "YEARLY" }).amount).toBe(160000);
  });

  it("promo bulanan dan tahunan boleh aktif bersamaan, masing-masing dipilih sesuai siklus", () => {
    const bulanan: PromoValue = { ...basePromo, id: "promo-bulanan", percent: "50", billingScope: "MONTHLY" };
    const tahunan: PromoValue = { ...basePromo, id: "promo-tahunan", percent: "20", billingScope: "YEARLY" };
    expect(selectBestAutoPromo({ promos: [bulanan, tahunan], planId: "plan-bisnis", cycle: "MONTHLY", amount: monthly })?.promo.id).toBe("promo-bulanan");
    expect(selectBestAutoPromo({ promos: [bulanan, tahunan], planId: "plan-bisnis", cycle: "YEARLY", amount: yearly })?.promo.id).toBe("promo-tahunan");
  });

  it("validasi harga tetap memakai harga normal siklus yang dipilih, bukan selalu harga bulanan", () => {
    // Tahunan saja: Rp150.000 valid walau lebih mahal dari Rp20.000/bulan.
    expect(promoFixedPriceError({ billingScope: "YEARLY", fixedPrice: "150000", monthlyPrice: monthly, yearlyPrice: yearly })).toBeNull();
    expect(calculatePromoDiscount({
      promo: { ...basePromo, kind: "FIXED", percent: null, billingScope: "YEARLY", plans: [{ planId: "plan-bisnis", fixedPrice: "150000" }] },
      planId: "plan-bisnis", cycle: "YEARLY", amount: yearly,
    })).toMatchObject({ eligible: true, discount: 50000, finalAmount: 150000 });
    // Bulanan saja dan keduanya tetap dibandingkan dengan harga bulanan.
    expect(promoFixedPriceError({ billingScope: "MONTHLY", fixedPrice: "150000", monthlyPrice: monthly, yearlyPrice: yearly }))
      .toBe("HARGA_PROMO_BULANAN_TIDAK_LEBIH_RENDAH");
    expect(promoFixedPriceError({ billingScope: "BOTH", fixedPrice: "150000", monthlyPrice: monthly, yearlyPrice: yearly }))
      .toBe("HARGA_PROMO_BULANAN_TIDAK_LEBIH_RENDAH");
    expect(promoFixedPriceError({ billingScope: "BOTH", fixedPrice: "10000", monthlyPrice: monthly, yearlyPrice: yearly })).toBeNull();
    expect(promoFixedPriceError({ billingScope: "YEARLY", fixedPrice: "250000", monthlyPrice: monthly, yearlyPrice: yearly }))
      .toBe("HARGA_PROMO_TAHUNAN_TIDAK_LEBIH_RENDAH");
    // Promo persen tidak punya harga akhir.
    expect(promoFixedPriceError({ billingScope: "YEARLY", fixedPrice: null, monthlyPrice: monthly, yearlyPrice: yearly })).toBeNull();
  });
});

describe("periode Jakarta", () => {
  it("memotong hari dan bulan pada tengah malam WIB", () => {
    const now = new Date("2026-11-15T18:30:00.000Z");
    expect(jakartaDayStart(now).toISOString()).toBe("2026-11-15T17:00:00.000Z");
    expect(jakartaMonthStart(now).toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(parseJakartaDate("2026-11-01")?.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(parseJakartaDate("15-11-2026")).toBeNull();
  });
});
