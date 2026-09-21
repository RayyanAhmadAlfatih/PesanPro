import { EntitlementFeature, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rate-limit";
import { isCommercialFeatureVisible } from "@/lib/access-policy";

const commercialFeatureSchema = z.nativeEnum(EntitlementFeature).refine(
  isCommercialFeatureVisible,
  "Legacy entitlement features cannot be managed commercially",
);

const overrideSchema = z.object({
  feature: commercialFeatureSchema,
  enabled: z.boolean(),
  limit: z.string().regex(/^\d+$/).nullable(),
  reason: z.string().trim().min(3).max(1000),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function requireOwner(userId: string) {
  return prisma.user.findFirst({ where: { id: userId, role: "USER" }, select: { id: true, email: true } });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;
  if (!await requireOwner(userId)) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  const data = await prisma.tenantEntitlementOverride.findMany({ where: { tenantId: userId }, orderBy: { feature: "asc" } });
  return NextResponse.json({
    data: data
      .filter((item) => isCommercialFeatureVisible(item.feature))
      .map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null })),
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = overrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid entitlement override", details: parsed.error.flatten() }, { status: 400 });
  const { userId } = await params;
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) return NextResponse.json({ error: "Override expiry must be in the future" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({ where: { id: userId, role: "USER" }, select: { id: true } });
      if (!owner) throw new Error("OWNER_NOT_FOUND");
      return tx.tenantEntitlementOverride.upsert({
        where: { tenantId_feature: { tenantId: userId, feature: parsed.data.feature } },
        update: {
          enabled: parsed.data.enabled,
          limitValue: parsed.data.limit === null ? null : BigInt(parsed.data.limit),
          reason: parsed.data.reason,
          expiresAt,
          createdById: actor.id,
        },
        create: {
          tenantId: userId,
          feature: parsed.data.feature,
          enabled: parsed.data.enabled,
          limitValue: parsed.data.limit === null ? null : BigInt(parsed.data.limit),
          reason: parsed.data.reason,
          expiresAt,
          createdById: actor.id,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "admin.entitlement_override.upsert",
      resource: "tenant_entitlement_override",
      resourceId: result.id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { tenantId: userId, feature: result.feature, enabled: result.enabled, limit: result.limitValue?.toString() ?? null, reason: parsed.data.reason, expiresAt },
    });
    return NextResponse.json({ data: { ...result, limitValue: result.limitValue?.toString() ?? null } });
  } catch (error) {
    if (error instanceof Error && error.message === "OWNER_NOT_FOUND") return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const feature = commercialFeatureSchema.safeParse(request.nextUrl.searchParams.get("feature"));
  const reason = z.string().trim().min(3).max(1000).safeParse(request.nextUrl.searchParams.get("reason"));
  if (!feature.success || !reason.success) return NextResponse.json({ error: "Feature and audit reason are required" }, { status: 400 });
  const { userId } = await params;
  const deleted = await prisma.tenantEntitlementOverride.deleteMany({ where: { tenantId: userId, feature: feature.data } });
  if (deleted.count !== 1) return NextResponse.json({ error: "Override not found" }, { status: 404 });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "admin.entitlement_override.delete",
    resource: "tenant_entitlement_override",
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { tenantId: userId, feature: feature.data, reason: reason.data },
  });
  return NextResponse.json({ data: { deleted: true } });
}
