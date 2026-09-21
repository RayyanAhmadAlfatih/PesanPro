import { purgeExpiredAuditLogs } from "./audit-retention";
import { getEnv } from "./env";
import { prisma } from "./prisma";

const DAY_MS = 86_400_000;

export function operationalRetentionBoundaries(now = new Date()) {
  return {
    heartbeatBefore: new Date(now.getTime() - 7 * DAY_MS),
    resolvedAlertBefore: new Date(now.getTime() - 90 * DAY_MS),
  };
}

export async function runOperationalMaintenance(now = new Date()) {
  const boundaries = operationalRetentionBoundaries(now);
  const [audit, heartbeats, alerts, overrides, rateLimits] = await Promise.all([
    purgeExpiredAuditLogs(getEnv().AUDIT_RETENTION_DAYS, now),
    prisma.runtimeHeartbeat.deleteMany({ where: { heartbeatAt: { lt: boundaries.heartbeatBefore } } }),
    prisma.operationalAlert.deleteMany({
      where: { status: "RESOLVED", resolvedAt: { lt: boundaries.resolvedAlertBefore } },
    }),
    prisma.tenantEntitlementOverride.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);

  return {
    auditLogs: audit.deleted,
    runtimeHeartbeats: heartbeats.count,
    resolvedAlerts: alerts.count,
    expiredEntitlementOverrides: overrides.count,
    expiredRateLimits: rateLimits.count,
    boundaries,
  };
}
