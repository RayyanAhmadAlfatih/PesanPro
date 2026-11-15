/**
 * Aturan harga promo PesanPro.
 *
 * Satu promo hanya boleh punya satu bentuk aktif:
 *   PERCENT  potongan persen
 *   FIXED    harga langsung berubah (harga akhir per paket)
 *   VOUCHER  kode yang harus diketik pembeli, potongan persen atau harga akhir
 *
 * Promo hanya untuk pembelian pertama. Perpanjangan memakai harga normal yang
 * dikunci di Subscription, bukan harga promo.
 *
 * Fungsi di file ini murni (tanpa Prisma) supaya bisa diuji tanpa database.
 */

export type PromoKindValue = "PERCENT" | "FIXED" | "VOUCHER";
export type PromoBillingScopeValue = "MONTHLY" | "YEARLY" | "BOTH";
export type BillingCycleValue = "MONTHLY" | "YEARLY";

export type PromoPlanValue = {
  planId: string;
  /** Harga akhir setelah promo untuk FIXED/VOUCHER; null untuk promo persen. */
  fixedPrice: string | number | null;
};

export type PromoValue = {
  id: string;
  name: string;
  kind: PromoKindValue;
  percent: string | number | null;
  code: string | null;
  enabled: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  billingScope: PromoBillingScopeValue;
  plans: PromoPlanValue[];
};

export type PromoUsageValue = {
  /** Pemakaian yang sudah dihitung: RESERVED + APPROVED. */
  total: number;
  /** Pemakaian oleh user yang sedang checkout. */
  byUser: number;
};

export type PromoDiscount = {
  eligible: boolean;
  reason?: string;
  discount: number;
  finalAmount: number;
};

const RUPIAH = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

export function toRupiah(value: string | number | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

export function formatRupiah(value: string | number | { toString(): string } | null | undefined): string {
  return `Rp${RUPIAH.format(toRupiah(value))}`;
}

export function promoDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isPromoActive(promo: Pick<PromoValue, "enabled" | "startsAt" | "endsAt">, now = new Date()): boolean {
  if (!promo.enabled) return false;
  const startsAt = promoDate(promo.startsAt);
  const endsAt = promoDate(promo.endsAt);
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

export function promoMatchesCycle(
  promo: Pick<PromoValue, "billingScope">,
  cycle: BillingCycleValue,
): boolean {
  return promo.billingScope === "BOTH" || promo.billingScope === cycle;
}

export function promoHasPlan(promo: Pick<PromoValue, "plans">, planId: string): boolean {
  return promo.plans.some((item) => item.planId === planId);
}

export function voucherMatchesCode(promo: Pick<PromoValue, "kind" | "code">, code: string | null | undefined): boolean {
  if (promo.kind !== "VOUCHER") return false;
  if (!promo.code || !code) return false;
  return promo.code.trim().toLowerCase() === code.trim().toLowerCase();
}

/**
 * Hitung potongan untuk satu paket pada satu siklus.
 *
 * Untuk FIXED dan VOUCHER berbentuk harga tetap, `fixedPrice` adalah harga
 * akhir yang pembeli bayar. Potongan = harga normal - harga akhir, tidak
 * pernah negatif.
 */
export function calculatePromoDiscount(input: {
  promo: PromoValue;
  planId: string;
  cycle: BillingCycleValue;
  amount: number;
}): PromoDiscount {
  const amount = toRupiah(input.amount);
  if (amount <= 0) return { eligible: false, reason: "NOMINAL_TIDAK_VALID", discount: 0, finalAmount: 0 };
  if (!input.promo.enabled) return { eligible: false, reason: "PROMO_NONAKTIF", discount: 0, finalAmount: amount };
  if (!promoMatchesCycle(input.promo, input.cycle)) {
    return { eligible: false, reason: "SIKLUS_TIDAK_COCOK", discount: 0, finalAmount: amount };
  }
  if (!promoHasPlan(input.promo, input.planId)) {
    return { eligible: false, reason: "PAKET_TIDAK_COCOK", discount: 0, finalAmount: amount };
  }

  if (input.promo.kind === "PERCENT" || (input.promo.kind === "VOUCHER" && input.promo.percent !== null)) {
    const percent = Math.min(100, Math.max(0, Number(input.promo.percent ?? 0)));
    if (!Number.isFinite(percent) || percent <= 0) {
      return { eligible: false, reason: "PERSEN_TIDAK_VALID", discount: 0, finalAmount: amount };
    }
    const discount = Math.min(amount, Math.round(amount * percent / 100));
    return { eligible: true, discount, finalAmount: amount - discount };
  }

  const target = input.promo.plans.find((item) => item.planId === input.planId)?.fixedPrice;
  if (target === null || target === undefined) {
    return { eligible: false, reason: "HARGA_PROMO_TIDAK_DIATUR", discount: 0, finalAmount: amount };
  }
  const finalAmount = toRupiah(target);
  if (finalAmount >= amount) {
    return { eligible: false, reason: "HARGA_PROMO_TIDAK_LEBIH_RENDAH", discount: 0, finalAmount: amount };
  }
  return { eligible: true, discount: amount - finalAmount, finalAmount };
}

/**
 * Harga satu siklus pembayaran. Pembelian pertama boleh memakai promo;
 * perpanjangan selalu memakai harga normal yang sudah dikunci di langganan.
 * Dipakai `quotePurchase` supaya aturan "bulan pertama promo, bulan kedua
 * normal" punya satu sumber kebenaran yang bisa diuji tanpa database.
 */
export function quoteCyclePrice(input: {
  firstPurchase: boolean;
  normalAmount: string | number;
  promo: PromoValue | null;
  planId: string;
  cycle: BillingCycleValue;
  now?: Date;
}): { baseAmount: number; discountAmount: number; amount: number } {
  const baseAmount = toRupiah(input.normalAmount);
  if (!input.firstPurchase || !input.promo || !isPromoActive(input.promo, input.now)) {
    return { baseAmount, discountAmount: 0, amount: baseAmount };
  }
  const discount = calculatePromoDiscount({
    promo: input.promo,
    planId: input.planId,
    cycle: input.cycle,
    amount: baseAmount,
  });
  if (!discount.eligible) return { baseAmount, discountAmount: 0, amount: baseAmount };
  return { baseAmount, discountAmount: discount.discount, amount: discount.finalAmount };
}

export function usageLimitReached(promo: PromoValue, usage: PromoUsageValue): string | null {
  if (promo.usageLimitTotal !== null && usage.total >= promo.usageLimitTotal) return "KUOTA_PROMO_HABIS";
  if (promo.usageLimitPerUser !== null && usage.byUser >= promo.usageLimitPerUser) return "BATAS_PER_PENGGUNA";
  return null;
}

/**
 * Promo persen/harga tetap otomatis dipilih yang potongannya paling besar.
 * Konflik promo aktif dicegah saat admin menyimpan, jadi biasanya hanya satu.
 */
export function selectBestAutoPromo(input: {
  promos: PromoValue[];
  planId: string;
  cycle: BillingCycleValue;
  amount: number;
  now?: Date;
}): { promo: PromoValue; discount: PromoDiscount } | null {
  const now = input.now ?? new Date();
  let best: { promo: PromoValue; discount: PromoDiscount } | null = null;
  for (const promo of input.promos) {
    if (promo.kind === "VOUCHER") continue;
    if (!isPromoActive(promo, now)) continue;
    const discount = calculatePromoDiscount({
      promo,
      planId: input.planId,
      cycle: input.cycle,
      amount: input.amount,
    });
    if (!discount.eligible) continue;
    if (!best || discount.discount > best.discount.discount) best = { promo, discount };
  }
  return best;
}

export function selectVoucher(input: {
  promos: PromoValue[];
  code: string;
  planId: string;
  cycle: BillingCycleValue;
  amount: number;
  usages: Map<string, PromoUsageValue>;
  now?: Date;
}): { promo: PromoValue; discount: PromoDiscount } | { error: string } {
  const now = input.now ?? new Date();
  const code = input.code.trim();
  if (!code) return { error: "KODE_VOUCHER_KOSONG" };
  const promo = input.promos.find((item) => voucherMatchesCode(item, code));
  if (!promo) return { error: "VOUCHER_TIDAK_DITEMUKAN" };
  if (!isPromoActive(promo, now)) return { error: "VOUCHER_TIDAK_AKTIF" };
  const reached = usageLimitReached(promo, input.usages.get(promo.id) ?? { total: 0, byUser: 0 });
  if (reached) return { error: reached };
  const discount = calculatePromoDiscount({
    promo,
    planId: input.planId,
    cycle: input.cycle,
    amount: input.amount,
  });
  if (!discount.eligible) return { error: discount.reason ?? "VOUCHER_TIDAK_BERLAKU" };
  return { promo, discount };
}

/**
 * Promo hanya untuk pembelian pertama: belum ada pembayaran disetujui dan
 * langganan saat ini masih di paket gratis ("Belum aktif").
 */
export function isFirstPurchaseEligible(input: {
  approvedPaymentCount: number;
  subscriptionPlanMonthly: string | number | null | undefined;
}): boolean {
  if (input.approvedPaymentCount > 0) return false;
  return toRupiah(input.subscriptionPlanMonthly) <= 0;
}

export function promoDiscountLabel(promo: Pick<PromoValue, "kind" | "percent" | "name">): string {
  if (promo.kind === "PERCENT" || promo.percent !== null) {
    const percent = Math.min(100, Math.max(0, Number(promo.percent ?? 0)));
    return `Hemat ${percent}%`;
  }
  if (promo.kind === "VOUCHER") return "Voucher";
  return promo.name;
}

/**
 * Batas hari ini/bulan berjalan mengikuti WIB (UTC+7, tanpa DST). Dipakai
 * laporan pemasukan supaya "hari ini" tidak bergeser di server UTC.
 */
export function jakartaDayStart(now = new Date()): Date {
  const shifted = new Date(now.getTime() + TIMEZONE_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TIMEZONE_OFFSET_MS);
}

export function jakartaMonthStart(now = new Date()): Date {
  const shifted = new Date(now.getTime() + TIMEZONE_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - TIMEZONE_OFFSET_MS);
}

export function parseJakartaDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
