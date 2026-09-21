import { BroadcastStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId, requireIdempotencyKey } from "@/lib/api-v1";
import { broadcastCreateSchema } from "@/lib/broadcast-input";
import { createBroadcast, listBroadcasts } from "@/lib/broadcast-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const rawStatus = request.nextUrl.searchParams.get("status");
    if (rawStatus && !Object.values(BroadcastStatus).includes(rawStatus as BroadcastStatus)) {
      return apiV1Error(requestId, "VALIDATION_ERROR", "Invalid broadcast status", 422);
    }
    const data = await listBroadcasts(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      {
        sessionId: request.nextUrl.searchParams.get("sessionId") || undefined,
        status: rawStatus as BroadcastStatus | undefined,
        limit: Number(request.nextUrl.searchParams.get("limit") || 25),
      },
    );
    return apiV1Success(requestId, data);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = broadcastCreateSchema.parse(await request.json());
    const result = await createBroadcast(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      input,
      requireIdempotencyKey(request.headers),
    );
    return apiV1Success(requestId, result.broadcast, result.idempotent ? 200 : 201, { idempotent: result.idempotent });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
