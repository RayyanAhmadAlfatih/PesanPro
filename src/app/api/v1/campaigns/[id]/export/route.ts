import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, getRequestId } from "@/lib/api-v1";
import { campaignResultsCsv } from "@/lib/campaign-csv";
import { getCampaignExportRows } from "@/lib/campaign-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    return new NextResponse(campaignResultsCsv(await getCampaignExportRows(user, id)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="campaign-${id.replace(/[^A-Za-z0-9_-]/g, "")}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      },
    });
  } catch (error) { return apiV1Exception(requestId, error); }
}
