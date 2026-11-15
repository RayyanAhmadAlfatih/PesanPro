import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildPlanCatalog } from "@/lib/promo-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const catalog = await buildPlanCatalog({ userId: session.user.id, includeEntitlements: true });
  return NextResponse.json({ data: catalog.plans, firstPurchase: catalog.firstPurchase });
}
