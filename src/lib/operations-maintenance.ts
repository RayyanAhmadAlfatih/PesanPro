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

// An OTP challenge is dead ten minutes after it is issued. A day is kept so an
// operator can still explain a failed sign-in; the audit log holds the durable
// record.
const OTP_CHALLENGE_RETENTION_MS = DAY_MS;

export function operationalRetentionBoundaries(now = new Date(), autoReplyRetentionDays = 30, messageRetentionDays = 0) {
  return {
    heartbeatBefore: new Date(now.getTime() - 7 * DAY_MS),
    resolvedAlertBefore: new Date(now.getTime() - 90 * DAY_MS),
    autoReplyLogBefore: new Date(now.getTime() - autoReplyRetentionDays * DAY_MS),
    staleQrBefore: new Date(now.getTime() - QR_STALE_MS),
    otpChallengeBefore: new Date(now.getTime() - OTP_CHALLENGE_RETENTION_MS),
    // null means the operator disabled message retention (MESSAGE_RETENTION_DAYS=0);
    // unset defaults to 30 days per the 2026-11-09 retention decision, so message
    // history and every content-bearing artifact is dropped past the window.
    messageBefore: messageRetentionDays > 0 ? new Date(now.getTime() - messageRetentionDays * DAY_MS) : null,
  };
}

export async function runOperationalMaintenance(now = new Date()) {
  const env = getEnv();
  const boundaries = operationalRetentionBoundaries(now, env.AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS, env.MESSAGE_RETENTION_DAYS);
  // The message-content window (30 days by default) also governs every place
  // that still carries the text of a customer message: webhook payloads,
  // delivery attempt logs, outbound jobs, finished schedules, and stories.
  // Each purge only touches rows past the window AND in a terminal state, so
  // queued or in-flight work is never dropped by a retention sweep.
  const contentBefore = boundaries.messageBefore;
  const skip = () => Promise.resolve({ count: 0 });
  const [audit, heartbeats, alerts, autoReplyLogs, overrides, rateLimits, privateMedia, idempotency, messages, pairingCodes, otpChallenges, webhookEvents, webhookDeliveries, webhookAttempts, webhookLogs, messageJobs, scheduledMessages, stories] = await Promise.all([
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
    // Idempotency records carry an `expiresAt` (7-day key window) but were never
    // reclaimed, so the table grew without bound. Reclaim the expired rows here;
    // the message job itself is retained for audit history.
    prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } }),
    contentBefore
      ? prisma.message.deleteMany({ where: { timestamp: { lt: contentBefore } } })
      : skip(),
    prisma.session.updateMany({
      where: {
        qr: { not: null },
        OR: [{ status: { not: "QR_REQUIRED" } }, { updatedAt: { lt: boundaries.staleQrBefore } }],
      },
      data: { qr: null },
    }),
    prisma.otpChallenge.deleteMany({ where: { expiresAt: { lt: boundaries.otpChallengeBefore } } }),
    // Webhook payloads embed the full message text. Dispatched/dead-lettered
    // events past the window are dropped unless a newer (possibly replayed)
    // delivery still references them — that guard lives in the relation filter.
    contentBefore
      ? prisma.webhookOutboxEvent.deleteMany({
          where: {
            createdAt: { lt: contentBefore },
            status: { in: ["DISPATCHED", "DEAD_LETTER"] },
            deliveries: { none: { createdAt: { gte: contentBefore } } },
          },
        })
      : skip(),
    contentBefore
      ? prisma.webhookDelivery.deleteMany({
          where: {
            createdAt: { lt: contentBefore },
            status: { in: ["SUCCEEDED", "DEAD_LETTER", "CANCELLED"] },
          },
        })
      : skip(),
    contentBefore
      ? prisma.webhookDeliveryAttempt.deleteMany({
          where: { startedAt: { lt: contentBefore }, status: { not: "PROCESSING" } },
        })
      : skip(),
    contentBefore
      ? prisma.webhookLog.deleteMany({ where: { createdAt: { lt: contentBefore } } })
      : skip(),
    contentBefore
      ? prisma.messageJob.deleteMany({
          where: {
            availableAt: { lt: contentBefore },
            status: { in: ["SENT", "DELIVERED", "READ", "FAILED", "CANCELLED"] },
          },
        })
      : skip(),
    contentBefore
      ? prisma.scheduledMessage.deleteMany({
          where: {
            createdAt: { lt: contentBefore },
            status: { in: ["COMPLETED", "CANCELLED", "FAILED"] },
          },
        })
      : skip(),
    contentBefore
      ? prisma.story.deleteMany({ where: { timestamp: { lt: contentBefore } } })
      : skip(),
  ]);

  return {
    auditLogs: audit.deleted,
    runtimeHeartbeats: heartbeats.count,
    resolvedAlerts: alerts.count,
    autoReplyTriggerLogs: autoReplyLogs.count,
    expiredEntitlementOverrides: overrides.count,
    expiredRateLimits: rateLimits.count,
    expiredPrivateMedia: privateMedia.deleted,
    expiredIdempotencyRecords: idempotency.count,
    expiredMessages: messages.count,
    expiredPairingCodes: pairingCodes.count,
    expiredOtpChallenges: otpChallenges.count,
    expiredWebhookEvents: webhookEvents.count,
    expiredWebhookDeliveries: webhookDeliveries.count,
    expiredWebhookAttempts: webhookAttempts.count,
    expiredWebhookLogs: webhookLogs.count,
    expiredMessageJobs: messageJobs.count,
    expiredScheduledMessages: scheduledMessages.count,
    expiredStories: stories.count,
    boundaries,
  };
}
