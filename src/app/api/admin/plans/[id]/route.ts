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

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  priceMonthly: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  entitlements: z.array(z.object({
    feature: commercialFeatureSchema,
    enabled: z.boolean(),
    limit: z.string().regex(/^\d+$/).nullable(),
  })).max(Object.keys(EntitlementFeature).length).optional(),
}).superRefine((value, context) => {
  if (value.entitlements) {
    const features = value.entitlements.map((item) => item.feature);
    if (new Set(features).size !== features.length) {
      context.addIssue({ code: "custom", path: ["entitlements"], message: "Entitlement features must be unique" });
    }
  }
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan update", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;

  try {
    const plan = await prisma.$transaction(async (tx) => {
      const current = await tx.plan.findUnique({ where: { id } });
      if (!current) throw new Error("PLAN_NOT_FOUND");
      const nextActive = parsed.data.isActive ?? current.isActive;
      const nextDefault = parsed.data.isDefault ?? current.isDefault;
      if (nextDefault && !nextActive) throw new Error("DEFAULT_MUST_BE_ACTIVE");
      if (current.isDefault && parsed.data.isDefault === false) throw new Error("DEFAULT_REPLACEMENT_REQUIRED");
      if (parsed.data.isDefault === true) await tx.plan.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });

      await tx.plan.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
          isDefault: parsed.data.isDefault,
          trialDays: parsed.data.trialDays,
          priceMonthly: parsed.data.priceMonthly,
          currency: parsed.data.currency,
        },
      });
      for (const entitlement of parsed.data.entitlements ?? []) {
        await tx.entitlement.upsert({
          where: { planId_feature: { planId: id, feature: entitlement.feature } },
          update: { enabled: entitlement.enabled, limitValue: entitlement.limit === null ? null : BigInt(entitlement.limit) },
          create: { planId: id, feature: entitlement.feature, enabled: entitlement.enabled, limitValue: entitlement.limit === null ? null : BigInt(entitlement.limit) },
        });
      }
      return tx.plan.findUniqueOrThrow({ where: { id }, include: { entitlements: { orderBy: { feature: "asc" } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "plan.update",
      resource: "plan",
      resourceId: id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({
      data: {
        ...plan,
        priceMonthly: plan.priceMonthly?.toString() ?? null,
        entitlements: plan.entitlements
          .filter((item) => isCommercialFeatureVisible(item.feature))
          .map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_NOT_FOUND") return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    if (error instanceof Error && error.message === "DEFAULT_MUST_BE_ACTIVE") return NextResponse.json({ error: "Default plan must remain active" }, { status: 400 });
    if (error instanceof Error && error.message === "DEFAULT_REPLACEMENT_REQUIRED") return NextResponse.json({ error: "Set another plan as default before removing this default" }, { status: 409 });
    throw error;
  }
}
