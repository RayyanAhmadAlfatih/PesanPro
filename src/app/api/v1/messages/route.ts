import { MessageJobStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { listMessageJobs } from "@/lib/message-job-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const rawStatus = request.nextUrl.searchParams.get("status");
    if (rawStatus && !Object.values(MessageJobStatus).includes(rawStatus as MessageJobStatus)) {
      return apiV1Error(requestId, "VALIDATION_ERROR", "Invalid message status", 422);
    }
    const result = await listMessageJobs(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      {
        status: rawStatus as MessageJobStatus | undefined,
        cursor: request.nextUrl.searchParams.get("cursor") || undefined,
        limit: Number(request.nextUrl.searchParams.get("limit") || 25),
      },
    );
    return apiV1Success(requestId, result.data, 200, { nextCursor: result.nextCursor });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
