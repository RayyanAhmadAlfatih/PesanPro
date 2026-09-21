import type { MissedRunPolicy, Role, ScheduleKind, ScheduleStatus } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { requireEntitlement, resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient } from "./message-recipient";
import { prisma } from "./prisma";
import { parseScheduleLocalDateTime, validateCronExpression, validateScheduleTimezone } from "./schedule-policy";

export type ScheduleActor = { id: string; role: Role; ownerId?: string | null; apiKeyId?: string };

export type ScheduleWriteInput = {
  sessionPublicId: string;
  recipient: string;
  text?: string;
  mediaId?: string;
  localDateTime: string;
  timezone: string;
  kind?: ScheduleKind;
  cronExpression?: string;
  missedRunPolicy?: MissedRunPolicy;
  misfireGraceSeconds?: number;
};

function scheduleDto(schedule: {
  id: string; jid: string; content: string | null; mediaId: string | null; mediaType: string | null;
  nextRunAt: Date; startAt: Date; timezone: string; kind: ScheduleKind; cronExpression: string | null;
  recurrenceRule: string | null; missedRunPolicy: MissedRunPolicy; misfireGraceSeconds: number;
  status: ScheduleStatus; version: number; lastRunAt: Date | null; completedAt: Date | null;
  cancelledAt: Date | null; safeErrorCode: string | null; safeErrorMessage: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: schedule.id,
    recipient: schedule.jid,
    text: schedule.content,
    mediaId: schedule.mediaId,
    mediaType: schedule.mediaType,
    nextRunAt: schedule.nextRunAt,
    startAt: schedule.startAt,
    timezone: schedule.timezone,
    kind: schedule.kind,
    cronExpression: schedule.cronExpression,
    recurrenceRule: schedule.recurrenceRule,
    missedRunPolicy: schedule.missedRunPolicy,
    misfireGraceSeconds: schedule.misfireGraceSeconds,
    status: schedule.status,
    version: schedule.version,
    lastRunAt: schedule.lastRunAt,
    completedAt: schedule.completedAt,
    cancelledAt: schedule.cancelledAt,
    error: schedule.safeErrorCode ? { code: schedule.safeErrorCode, message: schedule.safeErrorMessage } : null,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

export const serializeSchedule = scheduleDto;

async function resolveScheduleSession(actor: ScheduleActor, sessionPublicId: string) {
  const allowed = await canAccessSession(actor.id, actor.role, sessionPublicId);
  if (!allowed) throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  const session = await prisma.session.findUnique({
    where: { sessionId: sessionPublicId },
    include: { user: { select: { id: true, role: true, ownerId: true } } },
  });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  return session;
}

async function prepareScheduleInput(actor: ScheduleActor, input: ScheduleWriteInput) {
  const session = await resolveScheduleSession(actor, input.sessionPublicId);
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  const timezone = validateScheduleTimezone(input.timezone);
  const startAt = parseScheduleLocalDateTime(input.localDateTime, timezone);
  if (startAt.getTime() < Date.now() - 60_000) {
    throw new MessageJobError("SCHEDULE_IN_PAST", "Schedule time must not be in the past", 422, false);
  }
  const kind = input.kind ?? "ONE_TIME";
  const cronExpression = kind === "RECURRING"
    ? validateCronExpression(input.cronExpression ?? "", timezone, startAt)
    : null;
  const recipient = normalizeRecipient(input.recipient);
  const text = input.text?.trim() || null;
  if (!text && !input.mediaId) throw new MessageJobError("INVALID_SCHEDULE_CONTENT", "Text or media ID is required", 422, false);
  if (text && text.length > 4096) throw new MessageJobError("INVALID_SCHEDULE_CONTENT", "Text must not exceed 4096 characters", 422, false);

  let media: { id: string; mediaType: string } | null = null;
  if (input.mediaId) {
    media = await prisma.privateMedia.findFirst({
      where: { id: input.mediaId, tenantId, status: "ACTIVE" },
      select: { id: true, mediaType: true },
    });
    if (!media || media.mediaType === "TEXT") throw new MessageJobError("MEDIA_NOT_FOUND", "Private media was not found", 404, false);
  }
  const misfireGraceSeconds = input.misfireGraceSeconds ?? 300;
  if (!Number.isInteger(misfireGraceSeconds) || misfireGraceSeconds < 0 || misfireGraceSeconds > 86_400) {
    throw new MessageJobError("INVALID_MISFIRE_GRACE", "Misfire grace must be between 0 and 86400 seconds", 422, false);
  }
  return {
    session,
    recipient,
    text,
    media,
    startAt,
    timezone,
    kind,
    cronExpression,
    missedRunPolicy: input.missedRunPolicy ?? "SEND_LATE" as MissedRunPolicy,
    misfireGraceSeconds,
  };
}

export async function createSchedule(actor: ScheduleActor, input: ScheduleWriteInput) {
  const prepared = await prepareScheduleInput(actor, input);
  const schedule = await prisma.$transaction(async (tx) => {
    const entitlement = await requireEntitlement(actor.id, "SCHEDULED_MESSAGES", tx);
    const activeCount = await tx.scheduledMessage.count({
      where: { session: { userId: prepared.session.userId }, status: "ACTIVE" },
    });
    if (entitlement.limit !== null && BigInt(activeCount) >= entitlement.limit) {
      const { QuotaExceededError } = await import("./usage");
      throw new QuotaExceededError("SCHEDULED_MESSAGES", entitlement.limit);
    }
    return tx.scheduledMessage.create({
      data: {
        createdById: actor.id,
        sessionId: prepared.session.id,
        mediaId: prepared.media?.id,
        jid: prepared.recipient,
        content: prepared.text,
        mediaType: prepared.media?.mediaType,
        nextRunAt: prepared.startAt,
        startAt: prepared.startAt,
        timezone: prepared.timezone,
        kind: prepared.kind,
        cronExpression: prepared.cronExpression,
        recurrenceRule: prepared.cronExpression ? JSON.stringify({ type: "cron", value: prepared.cronExpression }) : null,
        missedRunPolicy: prepared.missedRunPolicy,
        misfireGraceSeconds: prepared.misfireGraceSeconds,
      },
    });
  }, { isolationLevel: "Serializable" });
  return scheduleDto(schedule);
}

export async function listSchedules(actor: ScheduleActor, input: { sessionPublicId: string; status?: ScheduleStatus; limit?: number }) {
  const session = await resolveScheduleSession(actor, input.sessionPublicId);
  const limit = Number.isInteger(input.limit) ? Math.min(100, Math.max(1, input.limit!)) : 50;
  const schedules = await prisma.scheduledMessage.findMany({
    where: { sessionId: session.id, ...(input.status ? { status: input.status } : {}) },
    orderBy: input.status === "ACTIVE" ? { nextRunAt: "asc" } : { updatedAt: "desc" },
    take: limit,
    include: {
      executions: {
        orderBy: { scheduledFor: "desc" },
        take: 5,
        include: { messageJob: { select: { id: true, status: true, safeErrorCode: true, safeErrorMessage: true } } },
      },
    },
  });
  return schedules.map((schedule) => ({ ...scheduleDto(schedule), executions: schedule.executions }));
}

export async function getSchedule(actor: ScheduleActor, sessionPublicId: string, scheduleId: string) {
  const session = await resolveScheduleSession(actor, sessionPublicId);
  const schedule = await prisma.scheduledMessage.findFirst({
    where: { id: scheduleId, sessionId: session.id },
    include: {
      executions: {
        orderBy: { scheduledFor: "desc" },
        take: 50,
        include: { messageJob: { select: { id: true, status: true, safeErrorCode: true, safeErrorMessage: true } } },
      },
    },
  });
  if (!schedule) throw new MessageJobError("SCHEDULE_NOT_FOUND", "Schedule was not found", 404, false);
  return { ...scheduleDto(schedule), executions: schedule.executions };
}

export async function updateSchedule(actor: ScheduleActor, scheduleId: string, input: ScheduleWriteInput) {
  const prepared = await prepareScheduleInput(actor, input);
  const current = await prisma.scheduledMessage.findFirst({ where: { id: scheduleId, sessionId: prepared.session.id } });
  if (!current) throw new MessageJobError("SCHEDULE_NOT_FOUND", "Schedule was not found", 404, false);
  if (current.status === "CANCELLED" || current.status === "COMPLETED") {
    throw new MessageJobError("INVALID_SCHEDULE_STATE", "Completed or cancelled schedules cannot be edited", 409, false);
  }
  if (current.lockedBy) throw new MessageJobError("SCHEDULE_BUSY", "Schedule is currently being processed", 409, true);
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: current.id, sessionId: prepared.session.id, lockedBy: null, status: { in: ["ACTIVE", "FAILED"] } },
    data: {
      mediaId: prepared.media?.id ?? null,
      jid: prepared.recipient,
      content: prepared.text,
      mediaUrl: null,
      mediaType: prepared.media?.mediaType ?? null,
      nextRunAt: prepared.startAt,
      startAt: prepared.startAt,
      timezone: prepared.timezone,
      kind: prepared.kind,
      cronExpression: prepared.cronExpression,
      recurrenceRule: prepared.cronExpression ? JSON.stringify({ type: "cron", value: prepared.cronExpression }) : null,
      missedRunPolicy: prepared.missedRunPolicy,
      misfireGraceSeconds: prepared.misfireGraceSeconds,
      status: "ACTIVE",
      version: { increment: 1 },
      safeErrorCode: null,
      safeErrorMessage: null,
      completedAt: null,
      cancelledAt: null,
    },
  });
  if (result.count === 0) throw new MessageJobError("SCHEDULE_BUSY", "Schedule state changed while editing", 409, true);
  return scheduleDto(await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: current.id } }));
}

export async function cancelSchedule(actor: ScheduleActor, sessionPublicId: string, scheduleId: string) {
  const session = await resolveScheduleSession(actor, sessionPublicId);
  const now = new Date();
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: scheduleId, sessionId: session.id, status: "ACTIVE", lockedBy: null },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  if (result.count === 0) {
    const schedule = await prisma.scheduledMessage.findFirst({ where: { id: scheduleId, sessionId: session.id } });
    if (!schedule) throw new MessageJobError("SCHEDULE_NOT_FOUND", "Schedule was not found", 404, false);
    throw new MessageJobError("INVALID_SCHEDULE_STATE", "Only an active, unclaimed schedule can be cancelled", 409, false);
  }
  return scheduleDto(await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduleId } }));
}
