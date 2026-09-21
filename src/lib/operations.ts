import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { OperationalAlertStatus, Prisma, type RuntimeProcessType } from "@prisma/client";
import si from "systeminformation";
import { getEnv } from "./env";
import { logger, redactLogValue } from "./logger";
import {
  evaluateOperationalConditions,
  isHeartbeatFresh,
  requiredProcessTypes,
  type OperationalCondition,
  type QueueHealthView,
} from "./operational-policy";
import { prisma } from "./prisma";

function ageMs(date: Date | null | undefined, now: Date) {
  return date ? Math.max(0, now.getTime() - date.getTime()) : null;
}

export async function collectDatabaseCheck() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true as const, latencyMs: Date.now() - startedAt };
  } catch (error) {
    logger.error("Readiness", "Database probe failed", error);
    return { ok: false as const, latencyMs: Date.now() - startedAt, errorCode: "DATABASE_UNAVAILABLE" };
  }
}

export async function collectStorageCheck() {
  const startedAt = Date.now();
  const configured = getEnv().PRIVATE_MEDIA_PATH;
  const root = path.isAbsolute(configured) ? configured : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  const probe = path.join(root, `.readiness-${process.pid}-${crypto.randomUUID()}`);
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(probe, "pesanpro-readiness", { flag: "wx" });
    const value = await fs.readFile(probe, "utf8");
    if (value !== "pesanpro-readiness") throw new Error("Storage probe content mismatch");
    const stats = await fs.statfs(root);
    return {
      ok: true as const,
      latencyMs: Date.now() - startedAt,
      path: root,
      freeBytes: (BigInt(stats.bavail) * BigInt(stats.bsize)).toString(),
      totalBytes: (BigInt(stats.blocks) * BigInt(stats.bsize)).toString(),
    };
  } catch (error) {
    logger.error("Readiness", "Private storage probe failed", error);
    return { ok: false as const, latencyMs: Date.now() - startedAt, path: root, errorCode: "STORAGE_UNAVAILABLE" };
  } finally {
    await fs.unlink(probe).catch(() => undefined);
  }
}

export async function collectQueueHealth(now = new Date()): Promise<QueueHealthView[]> {
  const [
    messagePending, messageProcessing, messageDead, oldestMessage,
    schedulePending, scheduleProcessing, scheduleFailed, oldestSchedule,
    broadcastPending, broadcastProcessing, broadcastFailed, oldestBroadcast,
    campaignPending, campaignProcessing, campaignFailed, oldestCampaign,
    autoreplyPending, autoreplyProcessing, autoreplyFailed, oldestAutoreply,
    webhookEventPending, webhookEventProcessing, webhookEventDead, oldestWebhookEvent,
    webhookDeliveryPending, webhookDeliveryProcessing, webhookDeliveryDead, oldestWebhookDelivery,
  ] = await Promise.all([
    prisma.messageJob.count({ where: { status: "QUEUED" } }),
    prisma.messageJob.count({ where: { status: "PROCESSING" } }),
    prisma.messageJob.count({ where: { status: "FAILED", deadLetteredAt: { not: null } } }),
    prisma.messageJob.findFirst({ where: { status: "QUEUED" }, orderBy: { availableAt: "asc" }, select: { availableAt: true } }),
    prisma.scheduledMessage.count({ where: { status: "ACTIVE" } }),
    prisma.scheduledMessage.count({ where: { status: "ACTIVE", lockedBy: { not: null }, leaseExpiresAt: { gt: now } } }),
    prisma.scheduledMessage.count({ where: { status: "FAILED" } }),
    prisma.scheduledMessage.findFirst({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, select: { nextRunAt: true } }),
    prisma.broadcastLog.count({ where: { status: "QUEUED" } }),
    prisma.broadcastLog.count({ where: { status: "RUNNING" } }),
    prisma.broadcastLog.count({ where: { status: "FAILED" } }),
    prisma.broadcastLog.findFirst({ where: { status: "QUEUED" }, orderBy: { nextDispatchAt: "asc" }, select: { nextDispatchAt: true } }),
    prisma.campaign.count({ where: { status: { in: ["SCHEDULED", "QUEUED"] } } }),
    prisma.campaign.count({ where: { status: "RUNNING" } }),
    prisma.campaign.count({ where: { status: "FAILED" } }),
    prisma.campaign.findFirst({ where: { status: { in: ["SCHEDULED", "QUEUED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.autoReplyTriggerLog.count({ where: { status: "PENDING" } }),
    prisma.autoReplyTriggerLog.count({ where: { status: "PROCESSING" } }),
    prisma.autoReplyTriggerLog.count({ where: { status: "FAILED" } }),
    prisma.autoReplyTriggerLog.findFirst({ where: { status: "PENDING" }, orderBy: { availableAt: "asc" }, select: { availableAt: true } }),
    prisma.webhookOutboxEvent.count({ where: { status: "PENDING" } }),
    prisma.webhookOutboxEvent.count({ where: { status: "PROCESSING" } }),
    prisma.webhookOutboxEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.webhookOutboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { availableAt: "asc" }, select: { availableAt: true } }),
    prisma.webhookDelivery.count({ where: { status: { in: ["PENDING", "RETRYING"] } } }),
    prisma.webhookDelivery.count({ where: { status: "PROCESSING" } }),
    prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }),
    prisma.webhookDelivery.findFirst({ where: { status: { in: ["PENDING", "RETRYING"] } }, orderBy: { availableAt: "asc" }, select: { availableAt: true } }),
  ]);

  return [
    { name: "messages", pending: messagePending, processing: messageProcessing, deadLetter: messageDead, oldestPendingAgeMs: ageMs(oldestMessage?.availableAt, now) },
    { name: "schedules", pending: schedulePending, processing: scheduleProcessing, deadLetter: scheduleFailed, oldestPendingAgeMs: ageMs(oldestSchedule?.nextRunAt, now) },
    { name: "broadcasts", pending: broadcastPending, processing: broadcastProcessing, deadLetter: broadcastFailed, oldestPendingAgeMs: ageMs(oldestBroadcast?.nextDispatchAt, now) },
    { name: "campaigns", pending: campaignPending, processing: campaignProcessing, deadLetter: campaignFailed, oldestPendingAgeMs: ageMs(oldestCampaign?.createdAt, now) },
    { name: "autoreplies", pending: autoreplyPending, processing: autoreplyProcessing, deadLetter: autoreplyFailed, oldestPendingAgeMs: ageMs(oldestAutoreply?.availableAt, now) },
    { name: "webhook-events", pending: webhookEventPending, processing: webhookEventProcessing, deadLetter: webhookEventDead, oldestPendingAgeMs: ageMs(oldestWebhookEvent?.availableAt, now) },
    { name: "webhook-deliveries", pending: webhookDeliveryPending, processing: webhookDeliveryProcessing, deadLetter: webhookDeliveryDead, oldestPendingAgeMs: ageMs(oldestWebhookDelivery?.availableAt, now) },
  ];
}

function expectedProcesses(): RuntimeProcessType[] {
  const env = getEnv();
  return requiredProcessTypes({
    message: env.MESSAGE_WORKER_MODE,
    schedule: env.SCHEDULE_WORKER_MODE,
    broadcast: env.BROADCAST_WORKER_MODE,
    campaign: env.CAMPAIGN_WORKER_MODE,
    autoreply: env.AUTOREPLY_WORKER_MODE,
    webhook: env.WEBHOOK_WORKER_MODE,
  });
}

export async function collectBusinessSnapshot(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [
    tenants, activeUsers, mauGroups, sentMessages, apiUsage, devices, connectedDevices,
    storage, subscriptionGroups, approvedPayments, subscriptions,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.user.count({ where: { role: "USER", status: "ACTIVE" } }),
    prisma.usageLedger.groupBy({ by: ["tenantId"], where: { createdAt: { gte: monthStart } } }),
    prisma.messageJob.count({ where: { createdAt: { gte: monthStart }, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
    prisma.usageLedger.aggregate({ where: { createdAt: { gte: monthStart }, feature: "API_REQUESTS_MONTHLY", operation: "COMMIT" }, _sum: { amount: true } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: "CONNECTED" } }),
    prisma.privateMedia.aggregate({ where: { status: "ACTIVE" }, _sum: { sizeBytes: true } }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.paymentVerification.aggregate({ where: { status: "APPROVED", reviewedAt: { gte: monthStart } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.subscription.findMany({ where: { status: { in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] } }, include: { plan: { select: { priceMonthly: true } } } }),
  ]);
  const recurringRevenue = subscriptions.reduce((sum, item) => sum.add(item.plan.priceMonthly ?? 0), new Prisma.Decimal(0));
  const realizedRevenue = approvedPayments._sum.amount ?? new Prisma.Decimal(0);
  const infraCost = new Prisma.Decimal(getEnv().MONTHLY_INFRA_COST_IDR);
  return {
    periodStart: monthStart,
    tenants,
    activeUsers,
    monthlyActiveTenants: mauGroups.length,
    sentMessages,
    apiRequests: (apiUsage._sum.amount ?? BigInt(0)).toString(),
    devices: { total: devices, connected: connectedDevices },
    storageBytes: (storage._sum.sizeBytes ?? BigInt(0)).toString(),
    subscriptions: Object.fromEntries(subscriptionGroups.map((item) => [item.status, item._count._all])),
    revenue: {
      currency: "IDR",
      recurringEstimate: recurringRevenue.toFixed(2),
      approvedPayments: realizedRevenue.toFixed(2),
      approvedPaymentCount: approvedPayments._count._all,
      configuredInfrastructureCost: infraCost.toFixed(2),
      estimatedNet: realizedRevenue.sub(infraCost).toFixed(2),
      note: "Estimated net excludes taxes, payment fees, labor, and unconfigured costs.",
    },
  };
}

async function persistConditions(conditions: OperationalCondition[], now: Date) {
  const cooldownMs = getEnv().OPS_ALERT_COOLDOWN_MS;
  await prisma.$transaction(async (tx) => {
    for (const condition of conditions) {
      const existing = await tx.operationalAlert.findUnique({ where: { fingerprint: condition.fingerprint } });
      const cooldownUntil = !existing?.cooldownUntil || existing.cooldownUntil <= now
        ? new Date(now.getTime() + cooldownMs)
        : existing.cooldownUntil;
      if (!existing) {
        await tx.operationalAlert.create({
          data: { ...condition, meta: redactLogValue(condition.meta) as Prisma.InputJsonValue, cooldownUntil, firstSeenAt: now, lastSeenAt: now },
        });
      } else {
        await tx.operationalAlert.update({
          where: { id: existing.id },
          data: {
            severity: condition.severity,
            title: condition.title,
            message: condition.message,
            source: condition.source,
            meta: redactLogValue(condition.meta) as Prisma.InputJsonValue,
            status: existing.status === "RESOLVED" ? "OPEN" : existing.status,
            occurrences: { increment: 1 },
            lastSeenAt: now,
            resolvedAt: existing.status === "RESOLVED" ? null : existing.resolvedAt,
            cooldownUntil,
          },
        });
      }
    }
    const fingerprints = conditions.map((item) => item.fingerprint);
    await tx.operationalAlert.updateMany({
      where: {
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
        ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}),
      },
      data: { status: "RESOLVED", resolvedAt: now },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function collectOperationalSnapshot(options: { persistAlerts?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const env = getEnv();
  const [database, storage, queues, heartbeats, fsSize, cpu, memory, business] = await Promise.all([
    collectDatabaseCheck(),
    collectStorageCheck(),
    collectQueueHealth(now),
    prisma.runtimeHeartbeat.findMany({ where: { heartbeatAt: { gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { heartbeatAt: "desc" }, take: 200 }),
    si.fsSize(),
    si.currentLoad(),
    si.mem(),
    collectBusinessSnapshot(now),
  ]);
  const requiredProcesses = expectedProcesses();
  const disks = fsSize.map((item) => ({ mount: item.mount || item.fs, usePercent: item.use }));
  const conditions = evaluateOperationalConditions({
    now,
    requiredProcesses,
    heartbeats,
    queues,
    databaseLatencyMs: database.latencyMs,
    disks,
    thresholds: {
      heartbeatStaleMs: env.RUNTIME_HEARTBEAT_STALE_MS,
      queueWarningAgeMs: env.OPS_QUEUE_WARNING_AGE_MS,
      queueCriticalAgeMs: env.OPS_QUEUE_CRITICAL_AGE_MS,
      diskWarningPercent: env.OPS_DISK_WARNING_PERCENT,
      diskCriticalPercent: env.OPS_DISK_CRITICAL_PERCENT,
      databaseWarningMs: env.OPS_DATABASE_WARNING_MS,
      databaseCriticalMs: env.OPS_DATABASE_CRITICAL_MS,
    },
  });
  if (options.persistAlerts && database.ok) await persistConditions(conditions, now);
  const alerts = database.ok ? await prisma.operationalAlert.findMany({ where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } }, orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }], take: 100 }) : [];
  const processHealth = requiredProcesses.map((processType) => {
    const heartbeat = heartbeats.find((item) => item.processType === processType && item.status !== "STOPPING");
    return { processType, ok: !!heartbeat && isHeartbeatFresh(heartbeat.heartbeatAt, now, env.RUNTIME_HEARTBEAT_STALE_MS), heartbeat: heartbeat ?? null };
  });
  return {
    timestamp: now,
    database,
    storage,
    processes: processHealth,
    queues,
    resources: {
      cpuPercent: cpu.currentLoad,
      memory: { totalBytes: memory.total.toString(), usedBytes: memory.active.toString(), usePercent: memory.total ? memory.active / memory.total * 100 : 0 },
      disks,
    },
    business,
    conditions,
    alerts,
  };
}

export async function collectReadinessSnapshot(now = new Date()) {
  const env = getEnv();
  const [database, storage, heartbeats] = await Promise.all([
    collectDatabaseCheck(),
    collectStorageCheck(),
    prisma.runtimeHeartbeat.findMany({ where: { heartbeatAt: { gte: new Date(now.getTime() - env.RUNTIME_HEARTBEAT_STALE_MS * 3) } }, orderBy: { heartbeatAt: "desc" } }).catch(() => []),
  ]);
  const processes = expectedProcesses().map((processType) => {
    const heartbeat = heartbeats.find((item) => item.processType === processType && item.status !== "STOPPING");
    return { processType, ok: !!heartbeat && isHeartbeatFresh(heartbeat.heartbeatAt, now, env.RUNTIME_HEARTBEAT_STALE_MS), lastHeartbeatAt: heartbeat?.heartbeatAt ?? null };
  });
  const ok = database.ok && storage.ok && processes.every((item) => item.ok);
  return { ok, timestamp: now, checks: { web: { ok: true }, database, storage, processes } };
}

export async function updateOperationalAlert(input: { id: string; action: "ACKNOWLEDGE" | "RESOLVE"; actorEmail: string }) {
  const status: OperationalAlertStatus = input.action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "RESOLVED";
  const now = new Date();
  const updated = await prisma.operationalAlert.updateMany({
    where: { id: input.id, status: { not: "RESOLVED" } },
    data: {
      status,
      acknowledgedByEmail: input.actorEmail,
      acknowledgedAt: now,
      ...(status === "RESOLVED" ? { resolvedAt: now } : {}),
    },
  });
  return updated.count === 1;
}
