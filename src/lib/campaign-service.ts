import { Prisma, type CampaignStatus, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { requireEntitlement, resolveTenantId } from "./billing";
import type { CampaignWriteInput } from "./campaign-input";
import { hashCanonicalJson } from "./canonical-json";
import { IdempotencyConflictError } from "./message-job-service";
import { MessageJobError } from "./message-job-errors";
import { validateBroadcastPackageLimits } from "./package-policy";
import { prisma } from "./prisma";
import { parseScheduleLocalDateTime } from "./schedule-policy";
import { segmentDefinitionSchema } from "./segment-input";
import { evaluateSegmentDefinition } from "./segment-service";
import { parseSpintax } from "./spintax";
import { commitReservedUsage, releaseReservedUsage, reserveUsage } from "./usage";

export type CampaignActor = { id: string; role: Role; ownerId?: string | null; apiKeyId?: string };

const campaignInclude = {
  versions: {
    orderBy: { version: "desc" as const },
    take: 1,
    include: {
      primarySession: { select: { id: true, sessionId: true, name: true, status: true } },
      fallbackSession: { select: { id: true, sessionId: true, name: true, status: true } },
      segment: { select: { id: true, name: true, version: true } },
      media: { select: { id: true, originalName: true, mediaType: true, status: true } },
      recipients: { orderBy: { position: "asc" as const }, take: 25 },
    },
  },
  broadcast: { select: { id: true, status: true, updatedAt: true } },
} satisfies Prisma.CampaignInclude;

type CampaignWithDetails = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

export function serializeCampaign(campaign: CampaignWithDetails) {
  const version = campaign.versions[0] ?? null;
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    currentVersion: campaign.currentVersion,
    scheduledAt: campaign.scheduledAt,
    timezone: campaign.timezone,
    progress: {
      total: campaign.total,
      queued: campaign.queued,
      sent: campaign.sent,
      delivered: campaign.delivered,
      read: campaign.read,
      failed: campaign.failed,
      skipped: campaign.skipped,
      unsubscribed: campaign.unsubscribed,
      cancelled: campaign.cancelled,
      percent: campaign.total === 0 ? 0 : Math.min(100, Math.round(((campaign.read + campaign.delivered + campaign.sent + campaign.failed + campaign.skipped + campaign.cancelled) / campaign.total) * 100)),
    },
    error: campaign.safeErrorCode ? { code: campaign.safeErrorCode, message: campaign.safeErrorMessage } : null,
    version: version ? {
      id: version.id,
      version: version.version,
      primarySession: version.primarySession,
      fallbackSession: version.fallbackSession,
      fallbackPolicy: version.fallbackPolicy,
      segment: version.segment,
      message: version.message,
      media: version.media,
      delayMinMs: version.delayMinMs,
      delayMaxMs: version.delayMaxMs,
      requireOptIn: version.requireOptIn,
      recipientSample: version.recipients,
    } : null,
    broadcast: campaign.broadcast,
    startedAt: campaign.startedAt,
    pausedAt: campaign.pausedAt,
    completedAt: campaign.completedAt,
    cancelledAt: campaign.cancelledAt,
    failedAt: campaign.failedAt,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

async function actorTenant(actor: CampaignActor) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  return tenantId;
}

async function resolveDevice(actor: CampaignActor, publicId: string) {
  if (!await canAccessSession(actor.id, actor.role, publicId)) {
    throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  }
  const device = await prisma.session.findUnique({ where: { sessionId: publicId }, select: { id: true, sessionId: true, userId: true } });
  if (!device) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  return device;
}

async function resolveConfiguration(actor: CampaignActor, input: CampaignWriteInput) {
  const delayEntitlement = await requireEntitlement(actor.id, "BROADCAST_MIN_DELAY_MS");
  const delayViolation = validateBroadcastPackageLimits(
    { recipientCount: 0, delayMinMs: input.delayMinMs },
    { recipientLimit: null, minimumDelayMs: delayEntitlement.limit },
  );
  if (delayViolation) throw new MessageJobError(delayViolation.code, delayViolation.message, 422, false);
  const primary = await resolveDevice(actor, input.primarySessionId);
  const fallback = input.fallbackSessionId ? await resolveDevice(actor, input.fallbackSessionId) : null;
  if (fallback && fallback.userId !== primary.userId) {
    throw new MessageJobError("FALLBACK_TENANT_MISMATCH", "Fallback device must belong to the same tenant", 422, false);
  }
  const segment = await prisma.segment.findFirst({ where: { id: input.segmentId, tenantId: primary.userId, isActive: true } });
  if (!segment) throw new MessageJobError("SEGMENT_NOT_FOUND", "Segment was not found for this tenant", 404, false);
  const definition = segmentDefinitionSchema.parse(segment.definition);
  const parsedMessage = parseSpintax(input.message);
  const media = input.mediaId ? await prisma.privateMedia.findFirst({
    where: { id: input.mediaId, tenantId: primary.userId, status: "ACTIVE" },
    select: { id: true, mediaType: true },
  }) : null;
  if (input.mediaId && (!media || media.mediaType === "TEXT")) {
    throw new MessageJobError("MEDIA_NOT_FOUND", "Compatible private media was not found", 404, false);
  }
  const configuration = {
    primarySessionId: primary.id,
    fallbackSessionId: fallback?.id ?? null,
    fallbackPolicy: input.fallbackPolicy,
    segmentId: segment.id,
    segmentVersion: segment.version,
    segmentDefinition: definition,
    message: parsedMessage.source,
    mediaId: media?.id ?? null,
    delayMinMs: input.delayMinMs,
    delayMaxMs: input.delayMaxMs,
    requireOptIn: input.requireOptIn,
  };
  return { primary, fallback, segment, definition, media, message: parsedMessage.source, hash: hashCanonicalJson(configuration) };
}

async function findCampaign(actor: CampaignActor, id: string) {
  const tenantId = await actorTenant(actor);
  const campaign = await prisma.campaign.findFirst({ where: { id, tenantId }, include: campaignInclude });
  if (!campaign) throw new MessageJobError("CAMPAIGN_NOT_FOUND", "Campaign was not found", 404, false);
  return campaign;
}

export async function getCampaign(actor: CampaignActor, id: string) {
  return serializeCampaign(await findCampaign(actor, id));
}

export async function listCampaigns(actor: CampaignActor, input: { status?: CampaignStatus; limit?: number } = {}) {
  const tenantId = await actorTenant(actor);
  const rows = await prisma.campaign.findMany({
    where: { tenantId, ...(input.status ? { status: input.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.max(1, Math.min(100, input.limit ?? 25)),
    include: campaignInclude,
  });
  return rows.map(serializeCampaign);
}

export async function getCampaignExportRows(actor: CampaignActor, id: string) {
  const campaign = await findCampaign(actor, id);
  const version = campaign.versions[0];
  if (!version) return [];
  const [snapshots, queueRows] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where: { campaignVersionId: version.id },
      orderBy: { position: "asc" },
      select: { jid: true, status: true, safeErrorCode: true },
    }),
    campaign.broadcast ? prisma.broadcastRecipient.findMany({
      where: { broadcastLogId: campaign.broadcast.id },
      select: { jid: true, status: true, safeErrorCode: true, messageJob: { select: { status: true, safeErrorCode: true } } },
    }) : Promise.resolve([]),
  ]);
  const queueByJid = new Map(queueRows.map((row) => [row.jid, row]));
  return snapshots.map((snapshot) => {
    const queued = queueByJid.get(snapshot.jid);
    return {
      recipient: snapshot.jid,
      snapshotStatus: snapshot.status,
      queueStatus: queued?.status ?? "NOT_HANDED_OFF",
      messageStatus: queued?.messageJob?.status ?? "",
      errorCode: queued?.messageJob?.safeErrorCode ?? queued?.safeErrorCode ?? snapshot.safeErrorCode ?? "",
    };
  });
}

export async function createCampaign(actor: CampaignActor, input: CampaignWriteInput, createKey: string) {
  const config = await resolveConfiguration(actor, input);
  const tenantId = config.primary.userId;
  const requestHash = hashCanonicalJson({ name: input.name, description: input.description ?? null, configurationHash: config.hash });
  const existing = await prisma.campaign.findUnique({ where: { tenantId_createKey: { tenantId, createKey } }, include: campaignInclude });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError();
    return { campaign: serializeCampaign(existing), idempotent: true };
  }
  try {
    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        createdById: actor.id,
        createKey,
        requestHash,
        name: input.name,
        description: input.description,
        versions: { create: {
          version: 1,
          primarySessionId: config.primary.id,
          fallbackSessionId: config.fallback?.id,
          fallbackPolicy: input.fallbackPolicy,
          segmentId: config.segment.id,
          mediaId: config.media?.id,
          message: config.message,
          delayMinMs: input.delayMinMs,
          delayMaxMs: input.delayMaxMs,
          requireOptIn: input.requireOptIn,
          segmentDefinition: config.definition as Prisma.InputJsonValue,
          configurationHash: config.hash,
        } },
      },
      include: campaignInclude,
    });
    return { campaign: serializeCampaign(campaign), idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.campaign.findUnique({ where: { tenantId_createKey: { tenantId, createKey } }, include: campaignInclude });
      if (raced && raced.requestHash === requestHash) return { campaign: serializeCampaign(raced), idempotent: true };
      if (raced) throw new IdempotencyConflictError();
    }
    throw error;
  }
}

export async function updateCampaignDraft(actor: CampaignActor, id: string, input: CampaignWriteInput) {
  const current = await findCampaign(actor, id);
  if (current.status !== "DRAFT") throw new MessageJobError("CAMPAIGN_LOCKED", "Only draft campaigns can be edited", 409, false);
  const config = await resolveConfiguration(actor, input);
  if (config.primary.userId !== current.tenantId) throw new MessageJobError("CAMPAIGN_TENANT_MISMATCH", "Campaign device must stay in the same tenant", 422, false);
  const nextVersion = current.currentVersion + 1;
  const changed = await prisma.$transaction(async (tx) => {
    const locked = await tx.campaign.updateMany({
      where: { id, tenantId: current.tenantId, status: "DRAFT", currentVersion: current.currentVersion },
      data: { name: input.name, description: input.description, currentVersion: nextVersion },
    });
    if (locked.count !== 1) return false;
    await tx.campaignVersion.create({ data: {
      campaignId: id,
      version: nextVersion,
      primarySessionId: config.primary.id,
      fallbackSessionId: config.fallback?.id,
      fallbackPolicy: input.fallbackPolicy,
      segmentId: config.segment.id,
      mediaId: config.media?.id,
      message: config.message,
      delayMinMs: input.delayMinMs,
      delayMaxMs: input.delayMaxMs,
      requireOptIn: input.requireOptIn,
      segmentDefinition: config.definition as Prisma.InputJsonValue,
      configurationHash: config.hash,
    } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!changed) throw new MessageJobError("CAMPAIGN_VERSION_CONFLICT", "Campaign was edited concurrently; reload and retry", 409, true);
  return getCampaign(actor, id);
}

export async function activateCampaign(actor: CampaignActor, id: string, input: { localDateTime?: string; timezone?: string }) {
  const current = await findCampaign(actor, id);
  const quotaKey = `campaign:${id}:v${current.currentVersion}`;
  if (current.status !== "DRAFT") {
    if (["SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "COMPLETED"].includes(current.status)) {
      await commitReservedUsage({ userId: actor.id, feature: "CAMPAIGNS_MONTHLY", idempotencyKey: quotaKey }).catch(() => undefined);
      return { campaign: await getCampaign(actor, id), idempotent: true };
    }
    throw new MessageJobError("INVALID_CAMPAIGN_STATE", "Cancelled or failed campaigns cannot be activated", 409, false);
  }
  const version = current.versions[0];
  if (!version) throw new MessageJobError("CAMPAIGN_VERSION_MISSING", "Campaign configuration is missing", 409, false);
  const scheduledAt = input.localDateTime && input.timezone ? parseScheduleLocalDateTime(input.localDateTime, input.timezone) : null;
  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new MessageJobError("SCHEDULE_IN_PAST", "Campaign schedule must be in the future", 422, false);
  }
  const evaluated = await evaluateSegmentDefinition(actor, version.primarySession.sessionId, segmentDefinitionSchema.parse(version.segmentDefinition), 0);
  if (evaluated.count === 0) throw new MessageJobError("EMPTY_CAMPAIGN_SEGMENT", "Campaign segment has no matching contacts", 422, false);
  const batchEntitlement = await requireEntitlement(actor.id, "BROADCAST_RECIPIENTS_PER_BATCH");
  const batchViolation = validateBroadcastPackageLimits(
    { recipientCount: evaluated.count, delayMinMs: version.delayMinMs },
    { recipientLimit: batchEntitlement.limit, minimumDelayMs: null },
  );
  if (batchViolation) throw new MessageJobError(batchViolation.code, batchViolation.message, 422, false);

  await reserveUsage({
    userId: actor.id,
    feature: "CAMPAIGNS_MONTHLY",
    amount: BigInt(1),
    idempotencyKey: quotaKey,
    apiKeyId: actor.apiKeyId,
    meta: { campaignId: id, version: current.currentVersion },
  });
  let activated = false;
  let campaignActive = false;
  try {
    activated = await prisma.$transaction(async (tx) => {
      const lock = await tx.campaign.updateMany({
        where: { id, tenantId: current.tenantId, status: "DRAFT", currentVersion: current.currentVersion },
        data: {
          status: scheduledAt ? "SCHEDULED" : "QUEUED",
          scheduledAt: scheduledAt ?? new Date(),
          timezone: input.timezone,
          total: evaluated.count,
          safeErrorCode: null,
          safeErrorMessage: null,
        },
      });
      if (lock.count !== 1) return false;
      await tx.campaignRecipient.createMany({
        data: evaluated.contacts.map((contact, position) => ({ campaignVersionId: version.id, contactId: contact.id, jid: contact.jid, position })),
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    campaignActive = activated;
    if (!activated) {
      const raced = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
      if (!raced || !["SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "COMPLETED"].includes(raced.status)) {
        throw new MessageJobError("CAMPAIGN_ACTIVATION_CONFLICT", "Campaign activation conflicted with another operation", 409, true);
      }
      campaignActive = true;
    }
    await commitReservedUsage({ userId: actor.id, feature: "CAMPAIGNS_MONTHLY", idempotencyKey: quotaKey });
    return { campaign: await getCampaign(actor, id), idempotent: !activated };
  } catch (error) {
    if (!campaignActive) await releaseReservedUsage({ userId: actor.id, feature: "CAMPAIGNS_MONTHLY", idempotencyKey: quotaKey }).catch(() => undefined);
    throw error;
  }
}

async function updateCampaignState(actor: CampaignActor, id: string, allowed: CampaignStatus[], target: CampaignStatus) {
  const current = await findCampaign(actor, id);
  if (!allowed.includes(current.status)) throw new MessageJobError("INVALID_CAMPAIGN_STATE", `Campaign cannot transition from ${current.status} to ${target}`, 409, false);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const changed = await tx.campaign.updateMany({
      where: { id, status: current.status },
      data: {
        status: target,
        pausedAt: target === "PAUSED" ? now : target === "QUEUED" || target === "SCHEDULED" ? null : undefined,
        cancelledAt: target === "CANCELLED" ? now : undefined,
        failedAt: target === "QUEUED" || target === "SCHEDULED" ? null : undefined,
        safeErrorCode: target === "QUEUED" || target === "SCHEDULED" ? null : undefined,
        safeErrorMessage: target === "QUEUED" || target === "SCHEDULED" ? null : undefined,
        materializeAttempts: target === "QUEUED" || target === "SCHEDULED" ? 0 : undefined,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (changed.count !== 1) throw new MessageJobError("CAMPAIGN_STATE_CONFLICT", "Campaign state changed concurrently", 409, true);
    if (target === "CANCELLED" && current.versions[0]) {
      const snapshotCancelled = await tx.campaignRecipient.updateMany({
        where: { campaignVersionId: current.versions[0].id, status: "PENDING" },
        data: { status: "CANCELLED", safeErrorCode: "CAMPAIGN_CANCELLED", safeErrorMessage: "Campaign was cancelled before handoff" },
      });
      if (snapshotCancelled.count) {
        await tx.campaign.update({ where: { id }, data: { cancelled: { increment: snapshotCancelled.count } } });
      }
    }
    if (!current.broadcast) return;
    if (target === "PAUSED") {
      await tx.broadcastLog.updateMany({ where: { id: current.broadcast.id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "PAUSED", pausedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null } });
    } else if (target === "QUEUED") {
      await tx.broadcastLog.updateMany({ where: { id: current.broadcast.id, status: { in: ["PAUSED", "FAILED"] } }, data: { status: "QUEUED", pausedAt: null, failedAt: null, nextDispatchAt: now, safeErrorCode: null, safeErrorMessage: null, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null } });
    } else if (target === "CANCELLED") {
      const cancelled = await tx.broadcastRecipient.updateMany({ where: { broadcastLogId: current.broadcast.id, status: { in: ["PENDING", "CLAIMED"] } }, data: { status: "CANCELLED", skippedAt: now, safeErrorCode: "CAMPAIGN_CANCELLED", safeErrorMessage: "Campaign was cancelled before enqueue" } });
      await tx.broadcastLog.updateMany({ where: { id: current.broadcast.id, status: { in: ["QUEUED", "RUNNING", "PAUSED", "FAILED"] } }, data: { status: "CANCELLED", cancelledAt: now, cancelled: { increment: cancelled.count }, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null } });
      if (cancelled.count) await tx.campaign.update({ where: { id }, data: { cancelled: { increment: cancelled.count } } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getCampaign(actor, id);
}

export function pauseCampaign(actor: CampaignActor, id: string) {
  return updateCampaignState(actor, id, ["SCHEDULED", "QUEUED", "RUNNING"], "PAUSED");
}

export async function resumeCampaign(actor: CampaignActor, id: string) {
  await requireEntitlement(actor.id, "CAMPAIGNS_MONTHLY");
  const current = await findCampaign(actor, id);
  const target: CampaignStatus = current.broadcast || !current.scheduledAt || current.scheduledAt <= new Date() ? "QUEUED" : "SCHEDULED";
  return updateCampaignState(actor, id, ["PAUSED", "FAILED"], target);
}

export function cancelCampaign(actor: CampaignActor, id: string) {
  return updateCampaignState(actor, id, ["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "FAILED"], "CANCELLED");
}
