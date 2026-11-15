import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizePromoInput } from "@/lib/promo-input";
import { findActivePromoConflict, PROMO_SELECT, toPromoValue } from "@/lib/promo-service";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const promoListSelect = {
  ...PROMO_SELECT,
  description: true,
  createdAt: true,
  updatedAt: true,
  plans: {
    select: { planId: true, fixedPrice: true, plan: { select: { name: true, code: true } } },
  },
} as const;

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.promo.findMany({ select: promoListSelect, orderBy: [{ enabled: "desc" }, { createdAt: "desc" }] });
  const usage = await prisma.promoRedemption.groupBy({ by: ["promoId", "status"], _count: { _all: true } });
  return NextResponse.json({
    data: rows.map((row) => {
      const count = (status: string) => usage.find((item) => item.promoId === row.id && item.status === status)?._count._all ?? 0;
      return {
        ...toPromoValue(row),
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        plans: row.plans.map((item) => ({
          planId: item.planId,
          fixedPrice: item.fixedPrice?.toString() ?? null,
          planName: item.plan.name,
          planCode: item.plan.code,
        })),
        usage: {
          reserved: count("RESERVED"),
          approved: count("APPROVED"),
          released: count("RELEASED"),
          active: count("RESERVED") + count("APPROVED"),
        },
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const normalized = normalizePromoInput(await request.json().catch(() => null));
  if (!normalized.ok) return NextResponse.json({ error: "Promo tidak valid", details: normalized.errors }, { status: 400 });
  const input = normalized.data;

  const plans = await prisma.plan.findMany({
    where: { id: { in: input.plans.map((item) => item.planId) }, isActive: true, priceMonthly: { gt: 0 } },
    select: { id: true, name: true, priceMonthly: true, priceYearly: true },
  });
  if (plans.length !== input.plans.length) {
    return NextResponse.json({ error: "Semua paket promo harus paket berbayar yang aktif." }, { status: 400 });
  }
  for (const item of input.plans) {
    if (!item.fixedPrice) continue;
    const plan = plans.find((candidate) => candidate.id === item.planId);
    if (!plan) continue;
    const monthly = Number(plan.priceMonthly ?? 0);
    const yearly = Number(plan.priceYearly ?? 0);
    const invalidMonthly = monthly > 0 && Number(item.fixedPrice) >= monthly;
    const invalidYearly = input.billingScope !== "MONTHLY" && yearly > 0 && Number(item.fixedPrice) >= yearly;
    if (invalidMonthly || invalidYearly) {
      return NextResponse.json({ error: `Harga promo untuk ${plan.name} harus lebih murah dari harga normal.` }, { status: 400 });
    }
  }

  const conflict = await findActivePromoConflict({
    enabled: input.enabled,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    billingScope: input.billingScope,
    planIds: input.plans.map((item) => item.planId),
  });
  if (conflict) {
    return NextResponse.json({ error: `Promo bentrok dengan "${conflict.name}" pada paket dan periode yang sama.` }, { status: 409 });
  }

  try {
    const promo = await prisma.promo.create({
      data: {
        name: input.name,
        description: input.description,
        kind: input.kind,
        percent: input.percent,
        code: input.code,
        enabled: input.enabled,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        usageLimitTotal: input.usageLimitTotal,
        usageLimitPerUser: input.usageLimitPerUser,
        billingScope: input.billingScope,
        createdById: actor.id,
        plans: {
          create: input.plans.map((item) => ({ planId: item.planId, fixedPrice: item.fixedPrice })),
        },
      },
      select: promoListSelect,
    });
    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "promo.create",
      resource: "promo",
      resourceId: promo.id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { name: promo.name, kind: promo.kind, plans: promo.plans.length, enabled: promo.enabled },
    });
    return NextResponse.json({
      data: {
        ...toPromoValue(promo),
        description: promo.description,
        createdAt: promo.createdAt,
        updatedAt: promo.updatedAt,
        plans: promo.plans.map((item) => ({
          planId: item.planId,
          fixedPrice: item.fixedPrice?.toString() ?? null,
          planName: item.plan.name,
          planCode: item.plan.code,
        })),
        usage: { reserved: 0, approved: 0, released: 0, active: 0 },
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode voucher sudah dipakai." }, { status: 409 });
    }
    throw error;
  }
}
