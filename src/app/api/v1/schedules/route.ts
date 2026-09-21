import { ScheduleStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Error, apiV1Exception, apiV1Success, getRequestId } from "@/lib/api-v1";
import { scheduleWriteSchema } from "@/lib/schedule-input";
import { createSchedule, listSchedules } from "@/lib/schedule-service";

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiV1Error(requestId, "UNAUTHORIZED", "Authentication is required", 401);
    const sessionPublicId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionPublicId) return apiV1Error(requestId, "VALIDATION_ERROR", "sessionId query parameter is required", 422);
    const rawStatus = request.nextUrl.searchParams.get("status");
    if (rawStatus && !Object.values(ScheduleStatus).includes(rawStatus as ScheduleStatus)) {
      return apiV1Error(requestId, "VALIDATION_ERROR", "Invalid schedule status", 422);
    }
    const data = await listSchedules(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      { sessionPublicId, status: rawStatus as ScheduleStatus | undefined, limit: Number(request.nextUrl.searchParams.get("limit") || 50) },
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
    const input = scheduleWriteSchema.parse(await request.json());
    const data = await createSchedule({ id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId }, {
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
    });
    return apiV1Success(requestId, data, 201);
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
