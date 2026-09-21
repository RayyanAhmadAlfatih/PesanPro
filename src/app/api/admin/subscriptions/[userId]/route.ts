import { SubscriptionStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

const updateSchema = z.object({
  planId: z.string().min(1),
  status: z.nativeEnum(SubscriptionStatus),
  endsAt: z.string().datetime().optional().nullable(),
  graceEndsAt: z.string().datetime().optional().nullable(),
  reason: z.string().trim().min(3).max(200),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription", details: parsed.error.flatten() }, { status: 400 });
  const { userId } = await params;
  const startsAt = new Date();
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  const graceEndsAt = parsed.data.graceEndsAt ? new Date(parsed.data.graceEndsAt) : null;
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: "Subscription end must be in the future" }, { status: 400 });
  }
  if (graceEndsAt && (!endsAt || graceEndsAt <= endsAt)) {
    return NextResponse.json({ error: "Grace period must end after the subscription" }, { status: 400 });
  }

  try {
    const subscription = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!user || user.role !== "USER") throw new Error("USER_NOT_FOUND");
      const plan = await tx.plan.findUnique({
        where: { id: parsed.data.planId },
        include: { entitlements: { where: { feature: "DEVICES" } } },
      });
      if (!plan || !plan.isActive) throw new Error("PLAN_NOT_FOUND");

      const updated = await tx.subscription.upsert({
        where: { userId },
        update: {
          planId: plan.id,
          status: parsed.data.status,
          startsAt,
          trialEndsAt: parsed.data.status === "TRIAL" ? endsAt : null,
          endsAt,
          graceEndsAt,
        },
        create: {
          userId,
          planId: plan.id,
          status: parsed.data.status,
          startsAt,
          trialEndsAt: parsed.data.status === "TRIAL" ? endsAt : null,
          endsAt,
          graceEndsAt,
        },
      });
      await tx.subscriptionHistory.create({
        data: {
          userId,
          planId: plan.id,
          status: parsed.data.status,
          reason: parsed.data.reason,
          startsAt,
          endsAt,
          graceEndsAt,
        },
      });

      const limits = new Map(plan.entitlements.map((item) => [item.feature, item.limitValue]));
      const deviceLimit = limits.get("DEVICES");
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(deviceLimit !== undefined && deviceLimit !== null ? { deviceLimit: Number(deviceLimit) } : {}),
          sessionVersion: { increment: 1 },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: "subscription.update",
      resource: "subscription",
      resourceId: subscription.id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: { targetUserId: userId, planId: parsed.data.planId, status: parsed.data.status, reason: parsed.data.reason },
    });
    return NextResponse.json({ data: subscription });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "PLAN_NOT_FOUND") {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    throw error;
  }
}
