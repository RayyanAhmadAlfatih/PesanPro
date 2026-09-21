import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { campaignWriteSchema } from "@/lib/campaign-input";
import { cancelCampaign, getCampaign, updateCampaignDraft } from "@/lib/campaign-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await getCampaign(user, (await params).id));
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await updateCampaignDraft(user, (await params).id, campaignWriteSchema.parse(await request.json())));
  } catch (error) { return apiV1Exception(requestId, error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    return apiV1Success(requestId, await cancelCampaign(user, (await params).id));
  } catch (error) { return apiV1Exception(requestId, error); }
}
