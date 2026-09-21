import { Prisma, type AutoReply, type PrivateMedia, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { autoReplyPreviewSchema, autoReplyWriteSchema, type AutoReplyPreviewInput, type AutoReplyWriteInput } from "./autoreply-input";
import { selectAutoReplyRule } from "./autoreply-policy";
import { requireEntitlement, resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";

export type AutoReplyActor = { id: string; role: Role; ownerId?: string | null };
type RuleWithMedia = AutoReply & { media: Pick<PrivateMedia, "id" | "originalName" | "mediaType" | "status"> | null };

function serializeRule(rule: RuleWithMedia) {
  return {
    id: rule.id,
    sessionId: rule.sessionId,
    name: rule.name,
    keyword: rule.keyword,
    matchType: rule.matchType,
    response: rule.response,
    media: rule.media,
    triggerType: rule.triggerType,
    priority: rule.priority,
    version: rule.version,
    timezone: rule.timezone,
    activeDays: rule.activeDays,
    activeStartTime: rule.activeStartTime,
    activeEndTime: rule.activeEndTime,
    cooldownSeconds: rule.cooldownSeconds,
    rateLimitCount: rule.rateLimitCount,
    rateLimitWindowSeconds: rule.rateLimitWindowSeconds,
    maxChainDepth: rule.maxChainDepth,
    isEnabled: rule.isEnabled,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

async function getAccessibleSession(actor: AutoReplyActor, publicId: string) {
  const [allowed, actorTenantId, session] = await Promise.all([
    canAccessSession(actor.id, actor.role, publicId),
    resolveTenantId(actor.id),
    prisma.session.findUnique({ where: { sessionId: publicId }, select: { id: true, userId: true, sessionId: true } }),
  ]);
  if (!allowed || !session || (actor.role !== "SUPERADMIN" && actorTenantId !== session.userId)) {
    throw new MessageJobError("AUTOREPLY_SESSION_NOT_FOUND", "Device was not found or is not accessible", 404, false);
  }
  return session;
}

async function assertMedia(tx: Prisma.TransactionClient, tenantId: string, sessionDbId: string, mediaId?: string) {
  if (!mediaId) return null;
  const media = await tx.privateMedia.findFirst({
    where: { id: mediaId, tenantId, status: "ACTIVE", OR: [{ sessionId: null }, { sessionId: sessionDbId }] },
    select: { id: true, mediaType: true },
  });
  if (!media) throw new MessageJobError("AUTOREPLY_MEDIA_NOT_FOUND", "Compatible private media was not found", 404, false);
  return media;
}

function writeData(input: AutoReplyWriteInput, media: { id: string; mediaType: string } | null) {
  return {
    name: input.name,
    keyword: input.keyword.trim(),
    matchType: input.matchType,
    response: input.response || null,
    mediaId: media?.id ?? null,
    isMedia: Boolean(media),
    mediaUrl: null,
    mediaType: media?.mediaType ?? null,
    triggerType: input.triggerType,
    priority: input.priority,
    timezone: input.timezone,
    activeDays: input.activeDays ?? Prisma.JsonNull,
    activeStartTime: input.activeStartTime ?? null,
    activeEndTime: input.activeEndTime ?? null,
    cooldownSeconds: input.cooldownSeconds,
    rateLimitCount: input.rateLimitCount,
    rateLimitWindowSeconds: input.rateLimitWindowSeconds,
    maxChainDepth: input.maxChainDepth,
    isEnabled: input.isEnabled,
  } satisfies Prisma.AutoReplyUncheckedUpdateInput;
}

async function conflictWarnings(sessionId: string, rule: { id: string; keyword: string; matchType: string; triggerType: string; priority: number }) {
  const conflicts = await prisma.autoReply.findMany({
    where: {
      sessionId,
      id: { not: rule.id },
      deletedAt: null,
      isEnabled: true,
      priority: rule.priority,
      matchType: rule.matchType as AutoReply["matchType"],
      keyword: rule.keyword,
      triggerType: { in: rule.triggerType === "ALL" ? ["ALL", "GROUP", "PRIVATE"] : ["ALL", rule.triggerType as "GROUP" | "PRIVATE"] },
    },
    select: { id: true, name: true },
    take: 10,
  });
  return conflicts.map((item) => ({ code: "RULE_PRIORITY_CONFLICT", ruleId: item.id, message: `Rule ${item.name || item.id} has the same trigger and priority` }));
}

export async function listAutoReplyRules(actor: AutoReplyActor, publicSessionId: string) {
  const session = await getAccessibleSession(actor, publicSessionId);
  const rules = await prisma.autoReply.findMany({
    where: { sessionId: session.id, deletedAt: null },
    include: { media: { select: { id: true, originalName: true, mediaType: true, status: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return rules.map(serializeRule);
}

export async function createAutoReplyRule(actor: AutoReplyActor, rawInput: AutoReplyWriteInput) {
  const input = autoReplyWriteSchema.parse(rawInput);
  const session = await getAccessibleSession(actor, input.sessionId);
  const created = await prisma.$transaction(async (tx) => {
    const entitlement = await requireEntitlement(actor.id, "AUTOREPLY_RULES", tx);
    const count = await tx.autoReply.count({ where: { session: { userId: session.userId }, deletedAt: null } });
    if (entitlement.limit !== null && BigInt(count) >= entitlement.limit) {
      throw new MessageJobError("AUTOREPLY_RULE_LIMIT_REACHED", "Auto-reply rule limit has been reached", 409, false);
    }
    const media = await assertMedia(tx, session.userId, session.id, input.mediaId);
    return tx.autoReply.create({
      data: { ...writeData(input, media), sessionId: session.id, createdById: actor.id },
      include: { media: { select: { id: true, originalName: true, mediaType: true, status: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { rule: serializeRule(created), warnings: await conflictWarnings(session.id, created) };
}

export async function updateAutoReplyRule(actor: AutoReplyActor, ruleId: string, rawInput: AutoReplyWriteInput) {
  const input = autoReplyWriteSchema.parse(rawInput);
  const session = await getAccessibleSession(actor, input.sessionId);
  const updated = await prisma.$transaction(async (tx) => {
    await requireEntitlement(actor.id, "AUTOREPLY_RULES", tx);
    const existing = await tx.autoReply.findFirst({ where: { id: ruleId, sessionId: session.id, deletedAt: null }, select: { id: true } });
    if (!existing) throw new MessageJobError("AUTOREPLY_RULE_NOT_FOUND", "Auto-reply rule was not found", 404, false);
    const media = await assertMedia(tx, session.userId, session.id, input.mediaId);
    return tx.autoReply.update({
      where: { id: existing.id },
      data: { ...writeData(input, media), version: { increment: 1 } },
      include: { media: { select: { id: true, originalName: true, mediaType: true, status: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { rule: serializeRule(updated), warnings: await conflictWarnings(session.id, updated) };
}

export async function setAutoReplyRuleEnabled(actor: AutoReplyActor, publicSessionId: string, ruleId: string, isEnabled: boolean) {
  const session = await getAccessibleSession(actor, publicSessionId);
  if (isEnabled) await requireEntitlement(actor.id, "AUTOREPLY_RULES");
  const changed = await prisma.autoReply.updateMany({
    where: { id: ruleId, sessionId: session.id, deletedAt: null },
    data: { isEnabled, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new MessageJobError("AUTOREPLY_RULE_NOT_FOUND", "Auto-reply rule was not found", 404, false);
  return { id: ruleId, isEnabled };
}

export async function deleteAutoReplyRule(actor: AutoReplyActor, publicSessionId: string, ruleId: string) {
  const session = await getAccessibleSession(actor, publicSessionId);
  const changed = await prisma.autoReply.updateMany({
    where: { id: ruleId, sessionId: session.id, deletedAt: null },
    data: { isEnabled: false, deletedAt: new Date(), version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new MessageJobError("AUTOREPLY_RULE_NOT_FOUND", "Auto-reply rule was not found", 404, false);
  return { id: ruleId, deleted: true };
}

export async function previewAutoReply(actor: AutoReplyActor, rawInput: AutoReplyPreviewInput) {
  const input = autoReplyPreviewSchema.parse(rawInput);
  const session = await getAccessibleSession(actor, input.sessionId);
  await requireEntitlement(actor.id, "AUTOREPLY_RULES");
  const rules = await prisma.autoReply.findMany({ where: { sessionId: session.id, deletedAt: null } });
  const result = selectAutoReplyRule(rules, { text: input.text, isGroup: input.isGroup, now: input.at });
  return {
    matched: Boolean(result.rule),
    selectedRuleId: result.rule?.id ?? null,
    conflictRuleIds: result.conflictRuleIds,
    evaluations: result.evaluations,
    sent: false,
  };
}

export async function listAutoReplyLogs(actor: AutoReplyActor, publicSessionId: string, limit = 50) {
  const session = await getAccessibleSession(actor, publicSessionId);
  return prisma.autoReplyTriggerLog.findMany({
    where: { sessionId: session.id },
    select: {
      id: true, sourceMessageId: true, sourceText: true, recipientJid: true, senderJid: true, isGroup: true,
      ruleId: true, ruleVersion: true, status: true, reasonCode: true, safeErrorMessage: true, messageJobId: true,
      attempts: true, enqueuedAt: true, finishedAt: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, Number.isInteger(limit) ? limit : 50)),
  });
}
