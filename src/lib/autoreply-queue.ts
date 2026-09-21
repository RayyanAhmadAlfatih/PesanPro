import crypto from "node:crypto";
import {
  Prisma,
  type AutoReply,
  type AutoReplyTriggerLog,
  type BotConfig,
  type PrivateMedia,
  type Session,
  type User,
} from "@prisma/client";
import { EntitlementDeniedError, requireEntitlement, SubscriptionInactiveError } from "./billing";
import { enqueueMessage } from "./message-job-service";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { selectAutoReplyRule } from "./autoreply-policy";
import { decideAutoReplyThrottle } from "./autoreply-throttle";
import { isRecipientSuppressed } from "./suppression";
import { QuotaExceededError } from "./usage";
import { getAutoReplyAccessReason } from "./autoreply-access";

export const DEFAULT_AUTOREPLY_LEASE_MS = 30_000;
export const MAX_AUTOREPLY_ATTEMPTS = 5;

type RuntimeRule = AutoReply & { media: PrivateMedia | null };
type RuntimeSession = Session & { user: User; botConfig: BotConfig | null };
type RuntimeTrigger = AutoReplyTriggerLog & { session: RuntimeSession; rule: RuntimeRule | null };
export type ClaimedAutoReplyTrigger = { trigger: RuntimeTrigger; claimToken: string; leaseMs: number };

export async function claimNextAutoReplyTrigger(workerId: string, leaseMs = DEFAULT_AUTOREPLY_LEASE_MS): Promise<ClaimedAutoReplyTrigger | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  await prisma.autoReplyTriggerLog.updateMany({
    where: { status: "PROCESSING", leaseExpiresAt: { lt: now }, attempts: { gte: MAX_AUTOREPLY_ATTEMPTS } },
    data: { status: "FAILED", reasonCode: "MAX_ATTEMPTS_EXCEEDED", safeErrorMessage: "Auto-reply processing exceeded the retry limit", finishedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  });
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE AutoReplyTriggerLog AS triggerRow
    INNER JOIN (
      SELECT candidate.id FROM (
        SELECT id FROM AutoReplyTriggerLog
        WHERE availableAt <= ${now}
          AND (status = 'PENDING' OR (status = 'PROCESSING' AND leaseExpiresAt < ${now}))
          AND attempts < ${MAX_AUTOREPLY_ATTEMPTS}
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = triggerRow.id
    SET triggerRow.status = 'PROCESSING',
        triggerRow.lockedBy = ${claimToken},
        triggerRow.leaseExpiresAt = ${leaseExpiresAt},
        triggerRow.heartbeatAt = ${now},
        triggerRow.attempts = triggerRow.attempts + 1,
        triggerRow.updatedAt = ${now}
    WHERE triggerRow.availableAt <= ${now}
      AND (triggerRow.status = 'PENDING' OR (triggerRow.status = 'PROCESSING' AND triggerRow.leaseExpiresAt < ${now}))
      AND triggerRow.attempts < ${MAX_AUTOREPLY_ATTEMPTS}
  `);
  if (claimed !== 1) return null;
  const trigger = await prisma.autoReplyTriggerLog.findFirst({
    where: { lockedBy: claimToken, status: "PROCESSING" },
    include: { session: { include: { user: true, botConfig: true } }, rule: { include: { media: true } } },
  }) as RuntimeTrigger | null;
  return trigger ? { trigger, claimToken, leaseMs } : null;
}

export function heartbeatAutoReplyTrigger(id: string, claimToken: string, leaseMs = DEFAULT_AUTOREPLY_LEASE_MS) {
  const now = new Date();
  return prisma.autoReplyTriggerLog.updateMany({
    where: { id, status: "PROCESSING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

async function finishSkipped(claim: ClaimedAutoReplyTrigger, reasonCode: string, message: string) {
  const now = new Date();
  const changed = await prisma.autoReplyTriggerLog.updateMany({
    where: { id: claim.trigger.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: { status: "SKIPPED", reasonCode, safeErrorMessage: message, finishedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  });
  return { action: changed.count === 1 ? "SKIPPED" as const : "CLAIM_LOST" as const, reasonCode };
}

function noMatchReason(evaluations: Array<{ reasonCode: string }>) {
  if (evaluations.length > 0 && evaluations.every((item) => item.reasonCode === "OUTSIDE_SCHEDULE" || item.reasonCode === "RULE_DISABLED")) return "OUTSIDE_SCHEDULE";
  if (evaluations.some((item) => item.reasonCode === "UNSAFE_REGEX")) return "UNSAFE_REGEX";
  return "NO_RULE_MATCHED";
}

async function snapshotRuleWithThrottle(claim: ClaimedAutoReplyTrigger, rule: RuntimeRule) {
  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const owned = await tx.autoReplyTriggerLog.findFirst({
          where: { id: claim.trigger.id, status: "PROCESSING", lockedBy: claim.claimToken },
          select: { id: true },
        });
        if (!owned) return { action: "CLAIM_LOST" as const };

        const oldDate = new Date("2000-01-01T00:00:00Z");
        await tx.autoReplyCooldown.upsert({
          where: { ruleId_contactJid: { ruleId: rule.id, contactJid: claim.trigger.senderJid } },
          create: {
            ruleId: rule.id,
            sessionId: claim.trigger.sessionId,
            contactJid: claim.trigger.senderJid,
            windowStartedAt: now,
            triggerCount: 0,
            lastTriggeredAt: oldDate,
            expiresAt: now,
          },
          update: {},
        });
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM AutoReplyCooldown
          WHERE ruleId = ${rule.id} AND contactJid = ${claim.trigger.senderJid}
          FOR UPDATE
        `);
        const state = await tx.autoReplyCooldown.findUniqueOrThrow({
          where: { ruleId_contactJid: { ruleId: rule.id, contactJid: claim.trigger.senderJid } },
        });
        const decision = decideAutoReplyThrottle(state, rule, now);
        if (!decision.allowed) {
          await tx.autoReplyTriggerLog.update({
            where: { id: claim.trigger.id },
            data: { status: "SKIPPED", ruleId: rule.id, ruleVersion: rule.version, chainDepth: decision.chainDepth, reasonCode: decision.reasonCode, safeErrorMessage: "Auto-reply contact protection blocked this trigger", finishedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
          });
          return { action: "SKIPPED" as const, reasonCode: decision.reasonCode };
        }

        await tx.autoReplyCooldown.update({
          where: { id: state.id },
          data: { ...decision.nextState, expiresAt: decision.expiresAt },
        });
        const snapshotMessageType = rule.media?.mediaType ?? "TEXT";
        await tx.autoReplyTriggerLog.update({
          where: { id: claim.trigger.id },
          data: {
            ruleId: rule.id,
            ruleVersion: rule.version,
            chainDepth: decision.chainDepth,
            snapshotResponse: rule.response,
            snapshotMediaId: rule.mediaId,
            snapshotMessageType,
            reasonCode: null,
            safeErrorMessage: null,
          },
        });
        return { action: "SNAPSHOTTED" as const, response: rule.response, mediaId: rule.mediaId, messageType: snapshotMessageType };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryableRace = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
      if (!retryableRace || attempt === 2) throw error;
    }
  }
  throw new Error("Auto-reply throttle transaction failed");
}

async function enqueueSnapshot(claim: ClaimedAutoReplyTrigger, snapshot: { response: string | null; mediaId: string | null; messageType: AutoReplyTriggerLog["snapshotMessageType"] }) {
  if (!snapshot.messageType) throw new MessageJobError("AUTOREPLY_SNAPSHOT_MISSING", "Auto-reply snapshot is incomplete", 500, false);
  const owned = await heartbeatAutoReplyTrigger(claim.trigger.id, claim.claimToken, claim.leaseMs);
  if (owned.count !== 1) return { action: "CLAIM_LOST" as const, messageJobId: null };
  const result = await enqueueMessage({
    actor: { id: claim.trigger.session.user.id, role: claim.trigger.session.user.role, ownerId: claim.trigger.session.user.ownerId },
    operation: "autoreply.execute",
    idempotencyKey: claim.trigger.id,
    sessionPublicId: claim.trigger.session.sessionId,
    recipient: claim.trigger.recipientJid,
    type: snapshot.messageType,
    text: snapshot.messageType === "TEXT" ? snapshot.response ?? undefined : undefined,
    caption: snapshot.messageType !== "TEXT" ? snapshot.response ?? undefined : undefined,
    mediaId: snapshot.mediaId ?? undefined,
    quotedMessageId: claim.trigger.sourceMessageId,
    priority: 25,
  });
  const now = new Date();
  const changed = await prisma.autoReplyTriggerLog.updateMany({
    where: { id: claim.trigger.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: { status: "ENQUEUED", messageJobId: result.job.id, reasonCode: "ENQUEUED", enqueuedAt: now, finishedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  });
  return { action: changed.count === 1 ? "ENQUEUED" as const : "CLAIM_LOST" as const, messageJobId: result.job.id };
}

export async function processClaimedAutoReply(claim: ClaimedAutoReplyTrigger) {
  if (claim.trigger.ruleId && claim.trigger.snapshotMessageType) {
    return enqueueSnapshot(claim, {
      response: claim.trigger.snapshotResponse,
      mediaId: claim.trigger.snapshotMediaId,
      messageType: claim.trigger.snapshotMessageType,
    });
  }

  const accessReason = getAutoReplyAccessReason(claim.trigger.session.botConfig, claim.trigger.senderJid);
  if (accessReason) return finishSkipped(claim, accessReason, "Auto-reply access settings blocked this trigger");
  await requireEntitlement(claim.trigger.session.user.id, "AUTOREPLY_RULES");
  if (await isRecipientSuppressed(claim.trigger.tenantId, claim.trigger.senderJid)) {
    return finishSkipped(claim, "RECIPIENT_SUPPRESSED", "Sender is on the tenant suppression list");
  }

  const rules = await prisma.autoReply.findMany({
    where: { sessionId: claim.trigger.sessionId, deletedAt: null },
    include: { media: true },
  }) as RuntimeRule[];
  const selected = selectAutoReplyRule(rules, { text: claim.trigger.sourceText ?? "", isGroup: claim.trigger.isGroup, now: claim.trigger.createdAt });
  if (!selected.rule) {
    const reason = noMatchReason(selected.evaluations);
    return finishSkipped(claim, reason, reason === "OUTSIDE_SCHEDULE" ? "No matching rule is active in this schedule" : "No auto-reply rule matched this message");
  }
  const rule = rules.find((item) => item.id === selected.rule!.id)!;
  if (rule.mediaId && (!rule.media || rule.media.status !== "ACTIVE")) {
    return finishSkipped(claim, "MEDIA_UNAVAILABLE", "Rule media is no longer available");
  }
  if (!rule.response && !rule.mediaId) return finishSkipped(claim, "EMPTY_RESPONSE", "Rule has no response payload");
  const snapshot = await snapshotRuleWithThrottle(claim, rule);
  if (snapshot.action !== "SNAPSHOTTED") return snapshot;
  return enqueueSnapshot(claim, snapshot);
}

export async function failClaimedAutoReply(claim: ClaimedAutoReplyTrigger, error: unknown) {
  const nonRetryableBilling = error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError || error instanceof QuotaExceededError;
  const retryable = nonRetryableBilling ? false : error instanceof MessageJobError ? error.retryable : true;
  const code = nonRetryableBilling ? (error instanceof QuotaExceededError ? "MESSAGE_QUOTA_EXCEEDED" : "ENTITLEMENT_DENIED") : error instanceof MessageJobError ? error.code : "AUTOREPLY_PROCESSING_FAILED";
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Auto-reply processing failed";
  const terminal = !retryable || claim.trigger.attempts >= MAX_AUTOREPLY_ATTEMPTS;
  const now = new Date();
  const changed = await prisma.autoReplyTriggerLog.updateMany({
    where: { id: claim.trigger.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: terminal ? {
      status: nonRetryableBilling ? "SKIPPED" : "FAILED",
      reasonCode: code,
      safeErrorMessage: message,
      finishedAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    } : {
      status: "PENDING",
      availableAt: new Date(now.getTime() + Math.min(60_000, 2 ** claim.trigger.attempts * 1000)),
      reasonCode: code,
      safeErrorMessage: message,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
  return { retrying: changed.count === 1 && !terminal, code };
}

export function recoverAutoReplyClaimsForWorker(workerId: string) {
  return prisma.autoReplyTriggerLog.updateMany({
    where: { status: "PROCESSING", lockedBy: { startsWith: `${workerId}:` } },
    data: { status: "PENDING", availableAt: new Date(), lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  }).then((result) => result.count);
}
