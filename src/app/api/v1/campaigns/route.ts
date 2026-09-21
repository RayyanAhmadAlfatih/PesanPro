import { CampaignStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { campaignWriteSchema } from "@/lib/campaign-input";
import { createCampaign, listCampaigns } from "@/lib/campaign-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const rawStatus = request.nextUrl.searchParams.get("status");
    if (rawStatus && !Object.values(CampaignStatus).includes(rawStatus as CampaignStatus)) {
      return apiV1Error(requestId, "VALIDATION_ERROR", "Invalid campaign status", 422);
    }
    return apiV1Success(requestId, await listCampaigns(user, {
      status: rawStatus as CampaignStatus | undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") || 25),
    }));
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const result = await createCampaign(user, campaignWriteSchema.parse(await request.json()), requireIdempotencyKey(request.headers));
    return apiV1Success(requestId, result.campaign, result.idempotent ? 200 : 201, { idempotent: result.idempotent });
  } catch (error) { return apiV1Exception(requestId, error); }
}
