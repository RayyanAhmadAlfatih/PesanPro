import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { listAutoReplyLogs } from "@/lib/autoreply-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
    if (!sessionId) return apiV1Error(requestId, "VALIDATION_ERROR", "sessionId is required", 422);
    return apiV1Success(requestId, await listAutoReplyLogs(user, sessionId, Number(request.nextUrl.searchParams.get("limit") || 50)));
  } catch (error) { return apiV1Exception(requestId, error); }
}
