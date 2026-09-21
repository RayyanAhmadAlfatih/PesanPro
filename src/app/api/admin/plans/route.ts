import { EntitlementFeature, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { isCommercialFeatureVisible } from "@/lib/access-policy";

const commercialFeatureSchema = z.nativeEnum(EntitlementFeature).refine(
  isCommercialFeatureVisible,
  "Legacy entitlement features cannot be managed commercially",
);

const entitlementSchema = z.object({
  feature: commercialFeatureSchema,
  enabled: z.boolean().default(true),
  limit: z.string().regex(/^\d+$/).nullable(),
});

const planSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,32}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  trialDays: z.number().int().min(0).max(365).default(0),
  priceMonthly: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3).default("IDR"),
  entitlements: z.array(entitlementSchema).min(1).max(Object.keys(EntitlementFeature).length),
}).superRefine((value, context) => {
  if (value.isDefault && !value.isActive) {
    context.addIssue({ code: "custom", path: ["isActive"], message: "Default plan must be active" });
  }
  const features = value.entitlements.map((item) => item.feature);
  if (new Set(features).size !== features.length) {
    context.addIssue({ code: "custom", path: ["entitlements"], message: "Entitlement features must be unique" });
  }
});

function serializePlan<T extends { priceMonthly: Prisma.Decimal | null; entitlements: Array<{ feature: string; limitValue: bigint | null }> }>(plan: T) {
  return {
    ...plan,
    priceMonthly: plan.priceMonthly?.toString() ?? null,
    entitlements: plan.entitlements
      .filter((item) => isCommercialFeatureVisible(item.feature))
      .map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null })),
  };
}

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plans = await prisma.plan.findMany({
    include: { entitlements: { orderBy: { feature: "asc" } }, _count: { select: { subscriptions: true } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ data: plans.map(serializePlan) });
}

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan", details: parsed.error.flatten() }, { status: 400 });

  try {
    const plan = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) await tx.plan.updateMany({ data: { isDefault: false } });
      return tx.plan.create({
        data: {
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
          isDefault: parsed.data.isDefault,
          trialDays: parsed.data.trialDays,
          priceMonthly: parsed.data.priceMonthly,
          currency: parsed.data.currency,
          entitlements: {
            create: parsed.data.entitlements.map((item) => ({
              feature: item.feature,
              enabled: item.enabled,
              limitValue: item.limit === null ? null : BigInt(item.limit),
            })),
          },
        },
        include: { entitlements: { orderBy: { feature: "asc" } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "plan.create",
      resource: "plan",
      resourceId: plan.id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { code: plan.code },
    });
    return NextResponse.json({ data: serializePlan(plan) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Plan code already exists" }, { status: 409 });
    }
    throw error;
  }
}
