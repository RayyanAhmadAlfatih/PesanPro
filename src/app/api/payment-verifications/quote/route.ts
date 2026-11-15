import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { quotePurchase, PromoPurchaseError } from "@/lib/promo-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = request.nextUrl.searchParams;
  const planId = search.get("planId")?.trim() ?? "";
  const cycle = search.get("cycle")?.toUpperCase() === "YEARLY" ? "YEARLY" : "MONTHLY";
  if (!planId) return NextResponse.json({ error: "Paket wajib dipilih." }, { status: 400 });
  try {
    const quote = await quotePurchase({
      userId: actor.id,
      planId,
      cycle,
      voucherCode: search.get("voucher"),
    });
    return NextResponse.json({ data: quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PromoPurchaseError) {
      return NextResponse.json({ error: error.message, errorCode: error.code }, { status: error.status });
    }
    throw error;
  }
}
