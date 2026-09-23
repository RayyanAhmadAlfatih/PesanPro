import { purgeExpiredAuditLogs } from "./audit-retention";
import { getEnv } from "./env";
import { prisma } from "./prisma";

const DAY_MS = 86_400_000;

export function operationalRetentionBoundaries(now = new Date(), autoReplyRetentionDays = 30) {
  return {
    heartbeatBefore: new Date(now.getTime() - 7 * DAY_MS),
    resolvedAlertBefore: new Date(now.getTime() - 90 * DAY_MS),
    autoReplyLogBefore: new Date(now.getTime() - autoReplyRetentionDays * DAY_MS),
  };
}

export async function runOperationalMaintenance(now = new Date()) {
  const env = getEnv();
  const boundaries = operationalRetentionBoundaries(now, env.AUTOREPLY_TRIGGER_LOG_RETENTION_DAYS);
  const [audit, heartbeats, alerts, autoReplyLogs, overrides, rateLimits] = await Promise.all([
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
  ]);

  return {
    auditLogs: audit.deleted,
    runtimeHeartbeats: heartbeats.count,
    resolvedAlerts: alerts.count,
    autoReplyTriggerLogs: autoReplyLogs.count,
    expiredEntitlementOverrides: overrides.count,
    expiredRateLimits: rateLimits.count,
    boundaries,
  };
}
