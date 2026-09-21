import crypto from "node:crypto";
import { Prisma, type Campaign, type CampaignVersion, type PrivateMedia, type Session, type User } from "@prisma/client";
import { EntitlementDeniedError, requireEntitlement, SubscriptionInactiveError } from "./billing";
import { calculateCampaignProgress, selectCampaignDevice } from "./campaign-progress";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { createWebhookOutboxEvent } from "./webhook-outbox";

export const DEFAULT_CAMPAIGN_LEASE_MS = 30_000;
export const MAX_CAMPAIGN_MATERIALIZE_ATTEMPTS = 8;

type ClaimedVersion = CampaignVersion & {
  primarySession: Session;
  fallbackSession: Session | null;
  media: PrivateMedia | null;
  recipients: Array<{ id: string; jid: string; position: number }>;
};

type CampaignRuntime = Campaign & { creator: User | null; versions: ClaimedVersion[] };

export type ClaimedCampaign = { campaign: CampaignRuntime; claimToken: string; leaseMs: number };

export async function claimNextDueCampaign(workerId: string, leaseMs = DEFAULT_CAMPAIGN_LEASE_MS): Promise<ClaimedCampaign | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE Campaign AS campaignRow
    INNER JOIN (
      SELECT candidate.id FROM (
        SELECT id FROM Campaign
        WHERE status IN ('SCHEDULED', 'QUEUED')
          AND scheduledAt <= ${now}
          AND (lockedBy IS NULL OR leaseExpiresAt < ${now})
        ORDER BY scheduledAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = campaignRow.id
    SET campaignRow.status = 'QUEUED',
        campaignRow.lockedBy = ${claimToken},
        campaignRow.leaseExpiresAt = ${leaseExpiresAt},
        campaignRow.heartbeatAt = ${now},
        campaignRow.materializeAttempts = campaignRow.materializeAttempts + 1,
        campaignRow.updatedAt = ${now}
    WHERE campaignRow.status IN ('SCHEDULED', 'QUEUED')
      AND campaignRow.scheduledAt <= ${now}
      AND (campaignRow.lockedBy IS NULL OR campaignRow.leaseExpiresAt < ${now})
  `);
  if (claimed !== 1) return null;
  const campaign = await prisma.campaign.findFirst({
    where: { lockedBy: claimToken, status: "QUEUED" },
    include: {
      creator: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { primarySession: true, fallbackSession: true, media: true, recipients: { orderBy: { position: "asc" } } },
      },
    },
  }) as CampaignRuntime | null;
  return campaign ? { campaign, claimToken, leaseMs } : null;
}

export function heartbeatCampaign(id: string, claimToken: string, leaseMs = DEFAULT_CAMPAIGN_LEASE_MS) {
  const now = new Date();
  return prisma.campaign.updateMany({
    where: { id, status: "QUEUED", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

async function recoverExistingHandoff(claim: ClaimedCampaign) {
  const existing = await prisma.broadcastLog.findUnique({ where: { campaignId: claim.campaign.id }, select: { id: true, status: true } });
  if (!existing) return null;
  const status = existing.status === "COMPLETED" ? "COMPLETED" : existing.status === "PAUSED" ? "PAUSED" : existing.status === "CANCELLED" ? "CANCELLED" : existing.status === "FAILED" ? "FAILED" : "RUNNING";
  await prisma.campaign.updateMany({
    where: { id: claim.campaign.id, lockedBy: claim.claimToken },
    data: { status, startedAt: claim.campaign.startedAt ?? new Date(), lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  });
  return { action: "RECOVERED" as const, broadcastId: existing.id };
}

export async function materializeClaimedCampaign(claim: ClaimedCampaign) {
  const recovered = await recoverExistingHandoff(claim);
  if (recovered) return recovered;
  const ownership = await heartbeatCampaign(claim.campaign.id, claim.claimToken, claim.leaseMs);
  if (ownership.count !== 1) return { action: "CLAIM_LOST" as const, broadcastId: null };
  const version = claim.campaign.versions[0];
  if (!version || version.version !== claim.campaign.currentVersion || !claim.campaign.creator) {
    throw new MessageJobError("CAMPAIGN_CONFIGURATION_MISSING", "Campaign configuration or creator is missing", 409, false);
  }
  await requireEntitlement(claim.campaign.creator.id, "CAMPAIGNS_MONTHLY");
  const selected = selectCampaignDevice({
    primary: version.primarySession,
    fallback: version.fallbackSession,
    fallbackPolicy: version.fallbackPolicy,
  });
  if (!selected) throw new MessageJobError("CAMPAIGN_DEVICE_UNAVAILABLE", "No connected primary or fallback device is available", 503, true);
  if (version.media && version.media.status !== "ACTIVE") {
    throw new MessageJobError("MEDIA_UNAVAILABLE", "Campaign media is unavailable", 410, false);
  }

  const jids = version.recipients.map((recipient) => recipient.jid);
  const [suppressions, optedInContacts] = await Promise.all([
    prisma.suppressionEntry.findMany({ where: { tenantId: claim.campaign.tenantId, jid: { in: jids }, removedAt: null }, select: { jid: true, reason: true } }),
    version.requireOptIn ? prisma.contact.findMany({ where: { sessionId: version.primarySessionId, jid: { in: jids }, consentStatus: "OPTED_IN" }, select: { jid: true } }) : Promise.resolve([]),
  ]);
  const suppressionByJid = new Map(suppressions.map((item) => [item.jid, item.reason]));
  const optedIn = new Set(optedInContacts.map((item) => item.jid));
  const now = new Date();
  const recipients = version.recipients.map((recipient) => {
    const suppression = suppressionByJid.get(recipient.jid);
    const code = suppression === "UNSUBSCRIBE" ? "RECIPIENT_UNSUBSCRIBED" : suppression ? "RECIPIENT_SUPPRESSED" : version.requireOptIn && !optedIn.has(recipient.jid) ? "OPT_IN_REQUIRED" : null;
    return {
      position: recipient.position,
      jid: recipient.jid,
      status: code ? "SKIPPED" as const : "PENDING" as const,
      safeErrorCode: code,
      safeErrorMessage: code === "RECIPIENT_UNSUBSCRIBED" ? "Recipient unsubscribed before campaign handoff" : code === "RECIPIENT_SUPPRESSED" ? "Recipient is on the suppression list" : code ? "Recipient has not opted in" : null,
      skippedAt: code ? now : null,
    };
  });
  const skipped = recipients.filter((recipient) => recipient.status === "SKIPPED").length;
  try {
    const broadcast = await prisma.$transaction(async (tx) => {
      const owned = await tx.campaign.updateMany({
        where: { id: claim.campaign.id, status: "QUEUED", lockedBy: claim.claimToken },
        data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + claim.leaseMs) },
      });
      if (owned.count !== 1) return null;
      const created = await tx.broadcastLog.create({
        data: {
          tenantId: claim.campaign.tenantId,
          createdById: claim.campaign.createdById,
          sessionDbId: selected.id,
          campaignId: claim.campaign.id,
          sessionId: selected.sessionId,
          createKey: `campaign:${claim.campaign.id}:v${version.version}`,
          requestHash: version.configurationHash,
          name: claim.campaign.name,
          message: version.message,
          mediaId: version.mediaId,
          mediaType: version.media?.mediaType,
          total: recipients.length,
          skipped,
          status: skipped === recipients.length ? "COMPLETED" : "QUEUED",
          delayMinMs: version.delayMinMs,
          delayMaxMs: version.delayMaxMs,
          jitterSeed: version.configurationHash,
          requireOptIn: version.requireOptIn,
          startedAt: now,
          completedAt: skipped === recipients.length ? now : null,
          recipients: { create: recipients },
        },
        select: { id: true, status: true },
      });
      await tx.campaignRecipient.updateMany({ where: { campaignVersionId: version.id }, data: { status: "HANDED_OFF" } });
      await tx.campaign.update({
        where: { id: claim.campaign.id },
        data: {
          status: skipped === recipients.length ? "COMPLETED" : "RUNNING",
          queued: recipients.length - skipped,
          skipped,
          unsubscribed: recipients.filter((recipient) => recipient.safeErrorCode === "RECIPIENT_UNSUBSCRIBED").length,
          startedAt: now,
          completedAt: skipped === recipients.length ? now : null,
          lockedBy: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          safeErrorCode: null,
          safeErrorMessage: null,
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return broadcast ? { action: "HANDED_OFF" as const, broadcastId: broadcast.id } : { action: "CLAIM_LOST" as const, broadcastId: null };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await recoverExistingHandoff(claim);
      if (raced) return raced;
    }
    throw error;
  }
}

export async function failClaimedCampaign(claim: ClaimedCampaign, error: unknown) {
  const entitlementFailure = error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError;
  const retryable = entitlementFailure ? false : error instanceof MessageJobError ? error.retryable : true;
  const code = entitlementFailure ? "ENTITLEMENT_DENIED" : error instanceof MessageJobError ? error.code : "CAMPAIGN_MATERIALIZE_FAILED";
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Campaign materialization failed";
  const terminal = !retryable || claim.campaign.materializeAttempts >= MAX_CAMPAIGN_MATERIALIZE_ATTEMPTS;
  const now = new Date();
  const changed = await prisma.campaign.updateMany({
    where: { id: claim.campaign.id, status: "QUEUED", lockedBy: claim.claimToken },
    data: terminal ? {
      status: "FAILED", failedAt: now, safeErrorCode: code, safeErrorMessage: message, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null,
    } : {
      status: "QUEUED", scheduledAt: new Date(now.getTime() + 15_000), safeErrorCode: code, safeErrorMessage: message, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null,
    },
  });
  return { retrying: changed.count === 1 && !terminal, code };
}

export async function reconcileCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { id: true, tenantId: true, status: true, broadcast: { select: { id: true, sessionDbId: true, status: true, completedAt: true, failedAt: true, cancelledAt: true, session: { select: { sessionId: true } } } } } });
  if (!campaign?.broadcast || campaign.status === "CANCELLED") return null;
  const broadcast = campaign.broadcast;
  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastLogId: broadcast.id },
    select: { status: true, safeErrorCode: true, messageJob: { select: { status: true } } },
  });
  const progress = calculateCampaignProgress(recipients);
  const targetStatus = campaign.status === "PAUSED" ? "PAUSED" : broadcast.status === "COMPLETED" ? "COMPLETED" : broadcast.status === "FAILED" ? "FAILED" : broadcast.status === "CANCELLED" ? "CANCELLED" : "RUNNING";
  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaign.id },
      data: {
        ...progress,
        status: targetStatus,
        completedAt: targetStatus === "COMPLETED" ? broadcast.completedAt ?? new Date() : null,
        failedAt: targetStatus === "FAILED" ? broadcast.failedAt ?? new Date() : null,
        cancelledAt: targetStatus === "CANCELLED" ? broadcast.cancelledAt ?? new Date() : null,
      },
    });
    if (campaign.status !== targetStatus) {
      await createWebhookOutboxEvent(tx, {
        tenantId: campaign.tenantId,
        sessionDbId: broadcast.sessionDbId,
        sessionPublicId: broadcast.session?.sessionId ?? null,
        eventType: "campaign.status",
        eventKey: `campaign:${campaign.id}:${targetStatus}`,
        data: { campaignId: campaign.id, broadcastId: broadcast.id, status: targetStatus, ...progress },
      });
    }
  });
  return { status: targetStatus, ...progress };
}

export async function reconcileActiveCampaigns(limit = 25) {
  const rows = await prisma.campaign.findMany({ where: { status: { in: ["RUNNING", "PAUSED"] }, broadcast: { isNot: null } }, orderBy: { updatedAt: "asc" }, take: limit, select: { id: true } });
  for (const row of rows) await reconcileCampaign(row.id);
  return rows.length;
}

export function recoverCampaignsForWorker(workerId: string) {
  return prisma.campaign.updateMany({
    where: { status: "QUEUED", lockedBy: { startsWith: `${workerId}:` } },
    data: { lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
  }).then((result) => result.count);
}
