import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plans = await prisma.plan.findMany({
    where: { isActive: true, priceMonthly: { gt: 0 } },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      trialDays: true,
      priceMonthly: true,
      currency: true,
      entitlements: { select: { feature: true, enabled: true, limitValue: true }, orderBy: { feature: "asc" } },
    },
    orderBy: [{ priceMonthly: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    data: plans.map((plan) => ({
      ...plan,
      priceMonthly: plan.priceMonthly?.toString() ?? null,
      entitlements: plan.entitlements.map((item) => ({ ...item, limitValue: item.limitValue?.toString() ?? null })),
    })),
  });
}
