import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { cancelMessageJob, getMessageJob } from "@/lib/message-job-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await context.params;
    return apiV1Success(requestId, await getMessageJob({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await context.params;
    return apiV1Success(requestId, await cancelMessageJob({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
