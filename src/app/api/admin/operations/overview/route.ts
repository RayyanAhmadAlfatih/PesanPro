import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { collectSuperadminOverview } from "@/lib/superadmin-overview";
import type { RevenuePreset } from "@/lib/revenue-report";

export const dynamic = "force-dynamic";

const PRESETS = new Set<RevenuePreset>([
  "TODAY", "THIS_WEEK", "7D", "LAST_30_DAYS", "THIS_MONTH", "LAST_MONTH", "ALL_TIME", "CUSTOM",
]);

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const search = request.nextUrl.searchParams;
  const presetParam = search.get("preset")?.toUpperCase() ?? "THIS_MONTH";
  const preset = PRESETS.has(presetParam as RevenuePreset) ? presetParam as RevenuePreset : "THIS_MONTH";
  try {
    const data = await collectSuperadminOverview({
      preset,
      from: search.get("from"),
      to: search.get("to"),
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to collect superadmin overview", errorCode: "SUPERADMIN_OVERVIEW_FAILED" }, { status: 503 });
  }
}
