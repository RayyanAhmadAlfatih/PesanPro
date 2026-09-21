import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { removeSuppression } from "@/lib/suppression";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ recipient: string }> }) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const { recipient } = await params;
    return apiV1Success(requestId, await removeSuppression({ id: user.id, role: user.role, ownerId: user.ownerId }, decodeURIComponent(recipient)));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
