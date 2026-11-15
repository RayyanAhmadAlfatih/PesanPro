import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  calculatePromoDiscount,
  isFirstPurchaseEligible,
  isPromoActive,
  quoteCyclePrice,
  selectBestAutoPromo,
  selectVoucher,
  toRupiah,
  type BillingCycleValue,
  type PromoUsageValue,
  type PromoValue,
} from "./promo-pricing";

export const PROMO_SELECT = {
  id: true,
  name: true,
  kind: true,
  percent: true,
  code: true,
  enabled: true,
  startsAt: true,
  endsAt: true,
  usageLimitTotal: true,
  usageLimitPerUser: true,
  billingScope: true,
  plans: { select: { planId: true, fixedPrice: true } },
} satisfies Prisma.PromoSelect;

type PromoRow = Prisma.PromoGetPayload<{ select: typeof PROMO_SELECT }>;

export function toPromoValue(promo: PromoRow): PromoValue {
  return {
    id: promo.id,
    name: promo.name,
    kind: promo.kind,
    percent: promo.percent?.toString() ?? null,
    code: promo.code,
    enabled: promo.enabled,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    usageLimitTotal: promo.usageLimitTotal,
    usageLimitPerUser: promo.usageLimitPerUser,
    billingScope: promo.billingScope,
    plans: promo.plans.map((item) => ({ planId: item.planId, fixedPrice: item.fixedPrice?.toString() ?? null })),
  };
}

export async function fetchPromoValues(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<PromoValue[]> {
  const rows = await client.promo.findMany({ select: PROMO_SELECT, orderBy: [{ createdAt: "desc" }] });
  return rows.map(toPromoValue);
}

export async function getPromoUsageMap(
  userId: string,
  promos: PromoValue[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Map<string, PromoUsageValue>> {
  const ids = promos.map((item) => item.id);
  const result = new Map<string, PromoUsageValue>();
  if (ids.length === 0) return result;
  const [totals, mine] = await Promise.all([
    client.promoRedemption.groupBy({
      by: ["promoId"],
      where: { promoId: { in: ids }, status: { in: ["RESERVED", "APPROVED"] } },
      _count: { _all: true },
    }),
    client.promoRedemption.groupBy({
      by: ["promoId"],
      where: { promoId: { in: ids }, userId, status: { in: ["RESERVED", "APPROVED"] } },
      _count: { _all: true },
    }),
  ]);
  for (const id of ids) {
    result.set(id, {
      total: totals.find((item) => item.promoId === id)?._count._all ?? 0,
      byUser: mine.find((item) => item.promoId === id)?._count._all ?? 0,
    });
  }
  return result;
}

export class PromoPurchaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "PromoPurchaseError";
  }
}

const CYCLE_LABEL: Record<BillingCycleValue, string> = { MONTHLY: "bulanan", YEARLY: "tahunan" };

export type PurchaseQuote = {
  plan: { id: string; code: string; name: string; currency: string };
  cycle: BillingCycleValue;
  listMonthlyPrice: string | null;
  listYearlyPrice: string | null;
  baseAmount: string;
  discountAmount: string;
  amount: string;
  firstPurchase: boolean;
  promo: { id: string; name: string; kind: string; percent: string | null; code: string | null } | null;
};

async function firstPurchaseState(userId: string, client: Prisma.TransactionClient | typeof prisma) {
  const [approvedCount, subscription] = await Promise.all([
    client.paymentVerification.count({ where: { userId, status: "APPROVED" } }),
    client.subscription.findUnique({
      where: { userId },
      select: {
        planId: true,
        lockedMonthlyPrice: true,
        lockedYearlyPrice: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
      },
    }),
  ]);
  return {
    subscription,
    eligible: isFirstPurchaseEligible({
      approvedPaymentCount: approvedCount,
      subscriptionPlanMonthly: subscription?.plan.priceMonthly?.toString() ?? null,
    }),
    approvedCount,
  };
}

export async function quotePurchase(input: {
  userId: string;
  planId: string;
  cycle: BillingCycleValue;
  voucherCode?: string | null;
  now?: Date;
  client?: Prisma.TransactionClient | typeof prisma;
}): Promise<PurchaseQuote> {
  const client = input.client ?? prisma;
  const plan = await client.plan.findFirst({
    where: { id: input.planId, isActive: true, priceMonthly: { gt: 0 } },
    select: { id: true, code: true, name: true, currency: true, priceMonthly: true, priceYearly: true },
  });
  if (!plan) throw new PromoPurchaseError("PAKET_TIDAK_DITEMUKAN", "Paket tidak ditemukan atau sudah tidak aktif.", 404);
  const listMonthly = plan.priceMonthly?.toString() ?? null;
  const listYearly = plan.priceYearly?.toString() ?? null;

  const state = await firstPurchaseState(input.userId, client);
  if (!state.eligible) {
    if (input.voucherCode?.trim()) {
      throw new PromoPurchaseError("PROMO_HANYA_PEMBELIAN_PERTAMA", "Promo dan voucher hanya berlaku untuk pembelian pertama.", 409);
    }
    const samePlan = state.subscription?.planId === plan.id;
    const locked = samePlan
      ? (input.cycle === "YEARLY" ? state.subscription?.lockedYearlyPrice : state.subscription?.lockedMonthlyPrice)
      : null;
    const lockedOrPlan = locked && toRupiah(locked) > 0
      ? locked
      : (input.cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly);
    const renewalListMonthly = samePlan && state.subscription?.lockedMonthlyPrice
      ? state.subscription.lockedMonthlyPrice.toString()
      : listMonthly;
    const renewalListYearly = samePlan && state.subscription?.lockedYearlyPrice
      ? state.subscription.lockedYearlyPrice.toString()
      : listYearly;
    return {
      plan,
      cycle: input.cycle,
      listMonthlyPrice: renewalListMonthly,
      listYearlyPrice: renewalListYearly,
      baseAmount: lockedOrPlan?.toString() ?? "0",
      discountAmount: "0",
      amount: lockedOrPlan?.toString() ?? "0",
      firstPurchase: false,
      promo: null,
    };
  }

  const promos = await fetchPromoValues(client);
  const selected = input.cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  if (!selected || toRupiah(selected) <= 0) {
    throw new PromoPurchaseError("HARGA_PAKET_TIDAK_TERSEDIA", `Paket ini belum punya harga ${CYCLE_LABEL[input.cycle]}.`, 422);
  }
  let chosen: { promo: PromoValue; discount: ReturnType<typeof calculatePromoDiscount> } | null = null;
  const code = input.voucherCode?.trim();
  if (code) {
    const usages = await getPromoUsageMap(input.userId, promos.filter((item) => item.kind === "VOUCHER"), client);
    const result = selectVoucher({
      promos,
      code,
      planId: plan.id,
      cycle: input.cycle,
      amount: toRupiah(selected),
      usages,
      now: input.now,
    });
    if ("error" in result) {
      throw new PromoPurchaseError(result.error, voucherErrorMessage(result.error), 422);
    }
    chosen = result;
  } else {
    chosen = selectBestAutoPromo({
      promos,
      planId: plan.id,
      cycle: input.cycle,
      amount: toRupiah(selected),
      now: input.now,
    });
  }

  const price = quoteCyclePrice({
    firstPurchase: true,
    normalAmount: selected.toString(),
    promo: chosen?.promo ?? null,
    planId: plan.id,
    cycle: input.cycle,
    now: input.now,
  });
  return {
    plan,
    cycle: input.cycle,
    listMonthlyPrice: listMonthly,
    listYearlyPrice: listYearly,
    baseAmount: String(price.baseAmount),
    discountAmount: String(price.discountAmount),
    amount: String(price.amount),
    firstPurchase: true,
    promo: chosen
      ? {
        id: chosen.promo.id,
        name: chosen.promo.name,
        kind: chosen.promo.kind,
        percent: chosen.promo.percent === null ? null : String(chosen.promo.percent),
        code: chosen.promo.code,
      }
      : null,
  };
}

export function voucherErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    KODE_VOUCHER_KOSONG: "Masukkan kode voucher.",
    VOUCHER_TIDAK_DITEMUKAN: "Kode voucher tidak ditemukan.",
    VOUCHER_TIDAK_AKTIF: "Voucher ini sedang tidak aktif.",
    KUOTA_PROMO_HABIS: "Kuota voucher sudah habis.",
    BATAS_PER_PENGGUNA: "Voucher ini sudah pernah Anda pakai.",
    SIKLUS_TIDAK_COCOK: "Voucher tidak berlaku untuk siklus pembayaran ini.",
    PAKET_TIDAK_COCOK: "Voucher tidak berlaku untuk paket ini.",
    HARGA_PROMO_TIDAK_DIATUR: "Voucher belum diatur untuk paket ini.",
    HARGA_PROMO_TIDAK_LEBIH_RENDAH: "Harga voucher tidak lebih rendah dari harga normal.",
    PERSEN_TIDAK_VALID: "Potongan voucher tidak valid.",
  };
  return messages[code] ?? "Voucher tidak bisa dipakai.";
}

export type PlanCatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  listMonthly: string | null;
  listYearly: string | null;
  priceMonthly: string | null;
  priceYearly: string | null;
  discountMonthly: string;
  discountYearly: string;
  promo: { id: string; name: string; kind: string; percent: string | null } | null;
  /** True kalau harga yang tampil adalah harga terkunci langganan ini. */
  renewalLocked: boolean;
  entitlements: Array<{ feature: string; enabled: boolean; limitValue: string | null }>;
};

/**
 * Katalog harga untuk landing page dan halaman Tagihan. Tanpa kode voucher,
 * hanya promo otomatis (persen/harga tetap) yang ditampilkan.
 */
export async function buildPlanCatalog(options: {
  userId?: string | null;
  now?: Date;
  includeEntitlements?: boolean;
} = {}): Promise<{ plans: PlanCatalogItem[]; firstPurchase: boolean }> {
  const now = options.now ?? new Date();
  const plans = await prisma.plan.findMany({
    where: { isActive: true, priceMonthly: { gt: 0 } },
    select: {
      id: true, code: true, name: true, description: true, currency: true,
      priceMonthly: true, priceYearly: true,
      entitlements: options.includeEntitlements
        ? { select: { feature: true, enabled: true, limitValue: true }, orderBy: { feature: "asc" } }
        : false,
    },
    orderBy: [{ priceMonthly: "asc" }, { name: "asc" }],
  });
  const promos = (await fetchPromoValues()).filter((promo) => promo.kind !== "VOUCHER" && isPromoActive(promo, now));
  let firstPurchase = true;
  let subscription: Awaited<ReturnType<typeof firstPurchaseState>>["subscription"] = null;
  if (options.userId) {
    const state = await firstPurchaseState(options.userId, prisma);
    firstPurchase = state.eligible;
    subscription = state.subscription;
  }

  return {
    firstPurchase,
    plans: plans.map((plan) => {
      const samePlan = subscription?.planId === plan.id;
      const lockedMonthly = samePlan && subscription?.lockedMonthlyPrice && toRupiah(subscription.lockedMonthlyPrice) > 0
        ? subscription.lockedMonthlyPrice.toString()
        : null;
      const lockedYearly = samePlan && subscription?.lockedYearlyPrice && toRupiah(subscription.lockedYearlyPrice) > 0
        ? subscription.lockedYearlyPrice.toString()
        : null;
      const monthlyBase = toRupiah(lockedMonthly ?? plan.priceMonthly);
      const yearlyBase = toRupiah(lockedYearly ?? plan.priceYearly);
      const monthlyPromo = firstPurchase
        ? selectBestAutoPromo({ promos, planId: plan.id, cycle: "MONTHLY", amount: monthlyBase, now })
        : null;
      const yearlyPromo = firstPurchase && yearlyBase > 0
        ? selectBestAutoPromo({ promos, planId: plan.id, cycle: "YEARLY", amount: yearlyBase, now })
        : null;
      return {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        currency: plan.currency,
        listMonthly: lockedMonthly ?? plan.priceMonthly?.toString() ?? null,
        listYearly: lockedYearly ?? plan.priceYearly?.toString() ?? null,
        priceMonthly: monthlyBase > 0 ? String(monthlyBase - (monthlyPromo?.discount.discount ?? 0)) : null,
        priceYearly: yearlyBase > 0 ? String(yearlyBase - (yearlyPromo?.discount.discount ?? 0)) : null,
        discountMonthly: String(monthlyPromo?.discount.discount ?? 0),
        discountYearly: String(yearlyPromo?.discount.discount ?? 0),
        promo: monthlyPromo
          ? { id: monthlyPromo.promo.id, name: monthlyPromo.promo.name, kind: monthlyPromo.promo.kind, percent: monthlyPromo.promo.percent === null ? null : String(monthlyPromo.promo.percent) }
          : null,
        renewalLocked: Boolean(lockedMonthly || lockedYearly),
        entitlements: Array.isArray(plan.entitlements)
          ? plan.entitlements.map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null }))
          : [],
      };
    }),
  };
}

/**
 * Cek bentrok promo aktif: untuk paket dan siklus yang sama tidak boleh ada
 * dua promo aktif dengan periode beririsan. Ini menjaga "satu promo satu
 * bentuk aktif" tetap benar tanpa memilih pemenang secara diam-diam.
 */
export async function findActivePromoConflict(input: {
  id?: string;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  billingScope: "MONTHLY" | "YEARLY" | "BOTH";
  planIds: string[];
}): Promise<{ id: string; name: string } | null> {
  if (!input.enabled) return null;
  const others = await prisma.promo.findMany({
    where: { enabled: true, id: input.id ? { not: input.id } : undefined },
    select: { id: true, name: true, startsAt: true, endsAt: true, billingScope: true, plans: { select: { planId: true } } },
  });
  const planSet = new Set(input.planIds);
  for (const other of others) {
    if (!other.plans.some((item) => planSet.has(item.planId))) continue;
    if (input.billingScope !== "BOTH" && other.billingScope !== "BOTH" && input.billingScope !== other.billingScope) continue;
    const startsOverlap = !input.endsAt || !other.startsAt || input.endsAt > other.startsAt;
    const endsOverlap = !input.startsAt || !other.endsAt || other.endsAt > input.startsAt;
    if (startsOverlap && endsOverlap) return { id: other.id, name: other.name };
  }
  return null;
}

/**
 * Dipanggil setelah redemption dibuat di transaksi yang sama. Menghitung ulang
 * kuota dari dalam transaksi membuat dua checkout bersamaan tidak bisa
 * melewati batas total tanpa salah satunya dibatalkan.
 */
export async function assertRedemptionWithinLimits(
  client: Prisma.TransactionClient,
  promoId: string,
  userId: string,
) {
  const promo = await client.promo.findUnique({
    where: { id: promoId },
    select: { usageLimitTotal: true, usageLimitPerUser: true },
  });
  if (!promo) throw new PromoPurchaseError("PROMO_TIDAK_DITEMUKAN", "Promo tidak ditemukan.", 404);
  const [total, mine] = await Promise.all([
    client.promoRedemption.count({ where: { promoId, status: { in: ["RESERVED", "APPROVED"] } } }),
    client.promoRedemption.count({ where: { promoId, userId, status: { in: ["RESERVED", "APPROVED"] } } }),
  ]);
  if (promo.usageLimitTotal !== null && total > promo.usageLimitTotal) {
    throw new PromoPurchaseError("KUOTA_PROMO_HABIS", "Kuota voucher sudah habis. Silakan bayar tanpa voucher.", 409);
  }
  if (promo.usageLimitPerUser !== null && mine > promo.usageLimitPerUser) {
    throw new PromoPurchaseError("BATAS_PER_PENGGUNA", "Voucher ini sudah pernah Anda pakai.", 409);
  }
}
