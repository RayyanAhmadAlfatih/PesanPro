import os from "node:os";
import { Prisma } from "@prisma/client";
import { evaluateCapacity, effectiveCapacityLimits, parseCapacityLimits, type CapacityLimitInput, type CapacityUsageInput } from "./capacity";
import { getEnv } from "./env";
import { collectOperationalSnapshot } from "./operations";
import { prisma } from "./prisma";
import {
  resolveRevenuePeriod,
  summarizeRevenue,
  type RevenuePreset,
} from "./revenue-report";
import { PROMO_SELECT, toPromoValue } from "./promo-service";

function maxDisk(disks: Array<{ mount: string; usePercent: number; usedBytes: string; sizeBytes: string }>) {
  return disks.reduce<typeof disks[number] | null>((best, item) => {
    if (!best || item.usePercent > best.usePercent) return item;
    return best;
  }, null);
}

export type SuperadminOverview = Awaited<ReturnType<typeof collectSuperadminOverview>>;

export async function collectSuperadminOverview(input: {
  preset?: RevenuePreset;
  from?: string | null;
  to?: string | null;
  now?: Date;
} = {}) {
  const now = input.now ?? new Date();
  const period = resolveRevenuePeriod({
    preset: input.preset ?? "THIS_MONTH",
    from: input.from,
    to: input.to,
    now,
  });
  const [snapshot, config, payingTenants, payments, promoRows, promoUsage, plans, pendingPayments] = await Promise.all([
    collectOperationalSnapshot({ persistAlerts: true, now }),
    prisma.systemConfig.findUnique({ where: { id: "default" } }),
    prisma.subscription.count({
      where: { status: { in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] }, plan: { priceMonthly: { gt: 0 } } },
    }),
    // Semua pembayaran yang tercatat (APPROVED + PENDING) tanpa batas baris:
    // laporan "semua waktu" tidak boleh terpotong oleh pagination.
    prisma.paymentVerification.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] } },
      select: {
        amount: true, discountAmount: true, reviewedAt: true, createdAt: true, status: true,
        plan: { select: { code: true, name: true } },
      },
    }),
    prisma.promo.findMany({
      select: {
        ...PROMO_SELECT,
        description: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    }),
    prisma.promoRedemption.groupBy({
      by: ["promoId", "status"],
      _count: { _all: true },
    }),
    prisma.plan.findMany({
      where: { priceMonthly: { gt: 0 } },
      select: {
        id: true, code: true, name: true, description: true, isActive: true, currency: true,
        priceMonthly: true, priceYearly: true,
        entitlements: { select: { feature: true, enabled: true, limitValue: true }, orderBy: { feature: "asc" } },
        priceHistory: {
          take: 12,
          orderBy: { changedAt: "desc" },
          select: {
            id: true, field: true, oldPrice: true, newPrice: true, changedAt: true,
            changedBy: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: [{ priceMonthly: "asc" }, { name: "asc" }],
    }),
    prisma.paymentVerification.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true, amount: true, baseAmount: true, discountAmount: true, billingCycle: true,
        currency: true, reference: true, proofUrl: true, voucherCode: true, createdAt: true,
        user: { select: { name: true, email: true, whatsappNumber: true } },
        plan: { select: { name: true, code: true } },
        bankAccount: { select: { bankName: true, accountNumber: true, accountHolder: true } },
      },
    }),
  ]);

  const infraCost = config?.vpsMonthlyCostIdr?.toString() ?? String(getEnv().MONTHLY_INFRA_COST_IDR || 90000);
  const revenue = summarizeRevenue({
    payments: payments.map((item) => ({
      amount: item.amount.toString(),
      discountAmount: item.discountAmount.toString(),
      reviewedAt: item.reviewedAt,
      createdAt: item.createdAt,
      status: item.status,
      planCode: item.plan?.code ?? null,
      planName: item.plan?.name ?? null,
    })),
    period,
    infraCostIdr: infraCost,
  });

  const disk = maxDisk(snapshot.resources.disks);
  const live: CapacityUsageInput = {
    cpuCores: os.cpus().length,
    cpuPercent: snapshot.resources.cpuPercent,
    ramTotalBytes: snapshot.resources.memory.totalBytes,
    ramUsedBytes: snapshot.resources.memory.usedBytes,
    diskTotalBytes: disk?.sizeBytes ?? "0",
    diskUsedBytes: disk?.usedBytes ?? "0",
    diskUsePercent: disk?.usePercent ?? 0,
    waSessions: snapshot.business.devices.total,
    monthlyMessages: snapshot.business.sentMessages,
    tenants: payingTenants,
  };
  const savedLimits = parseCapacityLimits(config?.capacityLimits);
  const hasSavedLimits = Object.values(savedLimits).some((value) => value !== null && value !== undefined);
  const capacity = evaluateCapacity(live, savedLimits);
  const effectiveLimits = effectiveCapacityLimits(live, savedLimits);

  const promoViews = promoRows.map((row) => {
    const usage = promoUsage.filter((item) => item.promoId === row.id);
    const count = (status: string) => usage.find((item) => item.status === status)?._count._all ?? 0;
    return {
      ...toPromoValue(row),
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      usage: {
        reserved: count("RESERVED"),
        approved: count("APPROVED"),
        released: count("RELEASED"),
        active: count("RESERVED") + count("APPROVED"),
      },
    };
  });

  return {
    generatedAt: now,
    revenue,
    capacity: {
      report: capacity,
      limits: effectiveLimits,
      savedLimits,
      source: hasSavedLimits ? "saved" as const : "live" as const,
      live,
      vpsMonthlyCostIdr: infraCost,
    },
    vps: {
      database: snapshot.database,
      storage: snapshot.storage,
      processes: snapshot.processes,
      queues: snapshot.queues,
      resources: snapshot.resources,
      alerts: snapshot.alerts,
      uptimeSeconds: Math.round(process.uptime()),
    },
    promos: promoViews,
    plans: plans.map((plan) => ({
      ...plan,
      priceMonthly: plan.priceMonthly?.toString() ?? null,
      priceYearly: plan.priceYearly?.toString() ?? null,
      entitlements: plan.entitlements.map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null })),
      priceHistory: plan.priceHistory.map((item) => ({
        ...item,
        oldPrice: item.oldPrice?.toString() ?? null,
        newPrice: item.newPrice?.toString() ?? null,
      })),
    })),
    pendingPayments: pendingPayments.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      baseAmount: item.baseAmount?.toString() ?? null,
      discountAmount: item.discountAmount.toString(),
    })),
    business: snapshot.business,
    settings: {
      vpsMonthlyCostIdr: infraCost,
      timezone: config?.timezone ?? "Asia/Jakarta",
    },
  };
}

export function serializeCapacityLimits(limits: Partial<CapacityLimitInput>): Prisma.InputJsonValue {
  return {
    cpuCores: limits.cpuCores ?? null,
    ramBytes: limits.ramBytes ?? null,
    diskBytes: limits.diskBytes ?? null,
    waSessions: limits.waSessions ?? null,
    monthlyMessages: limits.monthlyMessages ?? null,
  };
}
