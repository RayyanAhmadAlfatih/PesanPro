import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const billing = await getBillingSnapshot(session.user.id);
  if (!billing) return NextResponse.json({ error: "Billing subscription not found" }, { status: 404 });

  const usage = await prisma.usageCounter.findMany({
    where: { tenantId: billing.tenantId, periodEnd: { gt: new Date() } },
    select: { feature: true, consumed: true, reserved: true, periodStart: true, periodEnd: true },
    orderBy: { feature: "asc" },
  });

  return NextResponse.json({
    data: {
      ...billing,
      usage: usage.map((item) => ({
        ...item,
        consumed: item.consumed.toString(),
        reserved: item.reserved.toString(),
      })),
    },
  });
}
