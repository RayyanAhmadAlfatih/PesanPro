import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { revokeIntegrationToken } from "@/lib/integration-service";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await context.params;
    return apiV1Success(requestId, await revokeIntegrationToken({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email, apiKeyId: user.apiKeyId }, id, request.headers));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

