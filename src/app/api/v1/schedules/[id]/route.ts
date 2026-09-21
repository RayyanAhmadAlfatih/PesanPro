import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { scheduleWriteSchema } from "@/lib/schedule-input";
import { cancelSchedule, getSchedule, updateSchedule } from "@/lib/schedule-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return apiV1Error(requestId, "VALIDATION_ERROR", "sessionId query parameter is required", 422);
    const { id } = await params;
    return apiV1Success(requestId, await getSchedule({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, sessionId, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const input = scheduleWriteSchema.parse(await request.json());
    const { id } = await params;
    return apiV1Success(requestId, await updateSchedule({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, id, {
      sessionPublicId: input.sessionId,
      recipient: input.recipient,
      text: input.text,
      mediaId: input.mediaId,
      localDateTime: input.localDateTime,
      timezone: input.timezone,
      kind: input.kind,
      cronExpression: input.cronExpression,
      missedRunPolicy: input.missedRunPolicy,
      misfireGraceSeconds: input.misfireGraceSeconds,
    }));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return apiV1Error(requestId, "VALIDATION_ERROR", "sessionId query parameter is required", 422);
    const { id } = await params;
    return apiV1Success(requestId, await cancelSchedule({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, sessionId, id));
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
