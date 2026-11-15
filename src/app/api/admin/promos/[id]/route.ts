import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizePromoInput } from "@/lib/promo-input";
import { promoFixedPriceError } from "@/lib/promo-pricing";
import { findActivePromoConflict, PROMO_SELECT, toPromoValue } from "@/lib/promo-service";
import { getClientIp } from "@/lib/rate-limit";

const SCOPE_LABEL: Record<"MONTHLY" | "YEARLY" | "BOTH", string> = {
  MONTHLY: "bulanan",
  YEARLY: "tahunan",
  BOTH: "bulanan dan tahunan",
};

const promoListSelect = {
  ...PROMO_SELECT,
  description: true,
  createdAt: true,
  updatedAt: true,
  plans: {
    select: { planId: true, fixedPrice: true, plan: { select: { name: true, code: true } } },
  },
} as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const current = await prisma.promo.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!current) return NextResponse.json({ error: "Promo tidak ditemukan." }, { status: 404 });
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
    const invalid = promoFixedPriceError({
      billingScope: input.billingScope,
      fixedPrice: item.fixedPrice,
      monthlyPrice: plan.priceMonthly?.toString() ?? null,
      yearlyPrice: plan.priceYearly?.toString() ?? null,
    });
    if (invalid) {
      return NextResponse.json({
        error: `Harga promo untuk ${plan.name} harus lebih murah dari harga normal siklus yang dipilih (${SCOPE_LABEL[input.billingScope]}).`,
      }, { status: 400 });
    }
  }

  const conflict = await findActivePromoConflict({
    id,
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
    const promo = await prisma.$transaction(async (tx) => {
      await tx.promo.update({
        where: { id },
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
          plans: {
            deleteMany: {},
            create: input.plans.map((item) => ({ planId: item.planId, fixedPrice: item.fixedPrice })),
          },
        },
      });
      return tx.promo.findUniqueOrThrow({ where: { id }, select: promoListSelect });
    });
    const usage = await prisma.promoRedemption.groupBy({ by: ["status"], where: { promoId: id }, _count: { _all: true } });
    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "promo.update",
      resource: "promo",
      resourceId: id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { name: promo.name, kind: promo.kind, enabled: promo.enabled, plans: promo.plans.length },
    });
    const count = (status: string) => usage.find((item) => item.status === status)?._count._all ?? 0;
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
        usage: {
          reserved: count("RESERVED"),
          approved: count("APPROVED"),
          released: count("RELEASED"),
          active: count("RESERVED") + count("APPROVED"),
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Kode voucher sudah dipakai." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const promo = await prisma.promo.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!promo) return NextResponse.json({ error: "Promo tidak ditemukan." }, { status: 404 });
  const redemptions = await prisma.promoRedemption.count({ where: { promoId: id } });
  if (redemptions > 0) {
    return NextResponse.json({ error: "Promo sudah pernah dipakai. Nonaktifkan saja agar riwayat tetap utuh." }, { status: 409 });
  }
  await prisma.promo.delete({ where: { id } });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "promo.delete",
    resource: "promo",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { name: promo.name },
  });
  return NextResponse.json({ ok: true });
}
