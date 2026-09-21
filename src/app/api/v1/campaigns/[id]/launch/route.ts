import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { activateCampaign } from "@/lib/campaign-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const result = await activateCampaign(user, (await params).id, {});
    return apiV1Success(requestId, result.campaign, 200, { idempotent: result.idempotent });
  } catch (error) { return apiV1Exception(requestId, error); }
}
