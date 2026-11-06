import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { cancelBroadcast, deleteBroadcast, getBroadcast } from "@/lib/broadcast-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    return apiV1Success(requestId, await getBroadcast({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    // Dual semantics: default keeps the existing cancel behaviour for
    // QUEUED/RUNNING/PAUSED/FAILED; `?mode=delete` permanently removes a
    // COMPLETED or CANCELLED broadcast and its recipient rows.
    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "delete") {
      return apiV1Success(requestId, await deleteBroadcast({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
    }
    return apiV1Success(requestId, await cancelBroadcast({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
