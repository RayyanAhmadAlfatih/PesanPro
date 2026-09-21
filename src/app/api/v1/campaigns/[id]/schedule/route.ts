import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { campaignActivationSchema } from "@/lib/campaign-input";
import { activateCampaign } from "@/lib/campaign-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = campaignActivationSchema.parse(await request.json());
    if (!input.localDateTime || !input.timezone) return apiV1Error(requestId, "VALIDATION_ERROR", "A local schedule and timezone are required", 422);
    const result = await activateCampaign(user, (await params).id, input);
    return apiV1Success(requestId, result.campaign, 200, { idempotent: result.idempotent });
  } catch (error) { return apiV1Exception(requestId, error); }
}
