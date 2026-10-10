import { purgeExpiredAuditLogs } from "./audit-retention";
import { getEnv } from "./env";
import { prisma } from "./prisma";
import { purgeExpiredPrivateMedia } from "./private-media-lifecycle";

const DAY_MS = 86_400_000;

// A pairing QR is a credential: whoever holds it can link a device to the
// tenant's WhatsApp account. Baileys re-emits a fresh code every few seconds
// while a device is unpaired, so a stored code this old belongs to a session
// that stopped emitting.
const QR_STALE_MS = 60 * 60 * 1000;

export function operationalRetentionBoundaries(now = new Date(), autoReplyRetentionDays = 30, messageRetentionDays = 0) {
  return {
    heartbeatBefore: new Date(now.getTime() - 7 * DAY_MS),
    resolvedAlertBefore: new Date(now.getTime() - 90 * DAY_MS),
    autoReplyLogBefore: new Date(now.getTime() - autoReplyRetentionDays * DAY_MS),
    staleQrBefore: new Date(now.getTime() - QR_STALE_MS),
    // null means the operator has not enabled message retention (MESSAGE_RETENTION_DAYS=0),
    // so stored message history must be left untouched.
    messageBefore: messageRetentionDays > 0 ? new Date(now.getTime() - messageRetentionDays * DAY_MS) : null,
  };
}

export async function runOperationalMaintenance(now = new Date()) {
  const env = getEnv();
  const boundaries = operationalRetentionBoundaries(now, env.AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS, env.MESSAGE_RETENTION_DAYS);
  const [audit, heartbeats, alerts, autoReplyLogs, overrides, rateLimits, privateMedia, messages, pairingCodes] = await Promise.all([
    purgeExpiredAuditLogs(env.AUDIT_RETENTION_DAYS, now),
    prisma.runtimeHeartbeat.deleteMany({ where: { heartbeatAt: { lt: boundaries.heartbeatBefore } } }),
    prisma.operationalAlert.deleteMany({
      where: { status: "RESOLVED", resolvedAt: { lt: boundaries.resolvedAlertBefore } },
    }),
    prisma.autoReplyTriggerLog.deleteMany({
      where: {
        status: { in: ["ENQUEUED", "SKIPPED", "FAILED"] },
        finishedAt: { lt: boundaries.autoReplyLogBefore },
      },
    }),
    prisma.tenantEntitlementOverride.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
    purgeExpiredPrivateMedia(now),
    boundaries.messageBefore
      ? prisma.message.deleteMany({ where: { timestamp: { lt: boundaries.messageBefore } } })
      : Promise.resolve({ count: 0 }),
    prisma.session.updateMany({
      where: {
        qr: { not: null },
        OR: [{ status: { not: "QR_REQUIRED" } }, { updatedAt: { lt: boundaries.staleQrBefore } }],
      },
      data: { qr: null },
    }),
  ]);

  return {
    auditLogs: audit.deleted,
    runtimeHeartbeats: heartbeats.count,
    resolvedAlerts: alerts.count,
    autoReplyTriggerLogs: autoReplyLogs.count,
    expiredEntitlementOverrides: overrides.count,
    expiredRateLimits: rateLimits.count,
    expiredPrivateMedia: privateMedia.deleted,
    expiredMessages: messages.count,
    expiredPairingCodes: pairingCodes.count,
    boundaries,
  };
}
