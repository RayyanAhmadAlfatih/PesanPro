import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { resumeBroadcast } from "@/lib/broadcast-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { id } = await params;
    return apiV1Success(requestId, await resumeBroadcast({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
