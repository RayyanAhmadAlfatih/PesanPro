import moment from "moment-timezone";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiV1Exception, getRequestId } from "@/lib/api-v1";
import { prisma } from "@/lib/prisma";
import { legacyScheduleInputSchema } from "@/lib/schedule-input";
import { cancelSchedule, updateSchedule } from "@/lib/schedule-service";

type Context = { params: Promise<{ sessionId: string; scheduleId: string }> };

function normalizeLegacyDateTime(value: string, timezone: string) {
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = hasOffset ? moment.parseZone(value).tz(timezone) : moment.tz(value, timezone);
  return parsed.isValid() ? parsed.format("YYYY-MM-DDTHH:mm:ss") : value;
}

export async function PUT(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, scheduleId } = await params;
    const input = legacyScheduleInputSchema.parse(await request.json());
    if (input.mediaUrl) {
      return NextResponse.json({ status: false, code: "PRIVATE_MEDIA_REQUIRED", error: "Upload media first and use mediaId; external media URLs are not accepted" }, { status: 422 });
    }
    const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" }, select: { timezone: true } });
    const timezone = input.timezone || systemConfig?.timezone || "Asia/Jakarta";
    const schedule = await updateSchedule(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      scheduleId,
      {
        sessionPublicId: sessionId,
        recipient: input.jid,
        text: input.content ?? undefined,
        mediaId: input.mediaId ?? undefined,
        localDateTime: normalizeLegacyDateTime(input.sendAt, timezone),
        timezone,
        kind: input.cronExpression ? "RECURRING" : "ONE_TIME",
        cronExpression: input.cronExpression ?? undefined,
        missedRunPolicy: input.missedRunPolicy,
        misfireGraceSeconds: input.misfireGraceSeconds,
      },
    );
    return NextResponse.json({ status: true, data: schedule });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const requestId = getRequestId(request.headers);
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, scheduleId } = await params;
    const schedule = await cancelSchedule(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      sessionId,
      scheduleId,
    );
    return NextResponse.json({ status: true, message: "Schedule cancelled", data: schedule });
  } catch (error) {
    return apiV1Exception(requestId, error);
  }
}
