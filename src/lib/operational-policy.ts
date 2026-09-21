import type { OperationalAlertSeverity, RuntimeProcessStatus, RuntimeProcessType } from "@prisma/client";

export type HeartbeatView = {
  instanceId: string;
  processType: RuntimeProcessType;
  status: RuntimeProcessStatus;
  heartbeatAt: Date;
};

export type QueueHealthView = {
  name: string;
  pending: number;
  processing: number;
  deadLetter: number;
  oldestPendingAgeMs: number | null;
};

export type OperationalCondition = {
  fingerprint: string;
  kind: string;
  source: string;
  severity: OperationalAlertSeverity;
  title: string;
  message: string;
  meta?: Record<string, string | number | boolean | null>;
};

export type OperationalThresholds = {
  heartbeatStaleMs: number;
  queueWarningAgeMs: number;
  queueCriticalAgeMs: number;
  diskWarningPercent: number;
  diskCriticalPercent: number;
  databaseWarningMs: number;
  databaseCriticalMs: number;
};

export const DEFAULT_OPERATIONAL_THRESHOLDS: OperationalThresholds = {
  heartbeatStaleMs: 90_000,
  queueWarningAgeMs: 5 * 60_000,
  queueCriticalAgeMs: 30 * 60_000,
  diskWarningPercent: 80,
  diskCriticalPercent: 90,
  databaseWarningMs: 500,
  databaseCriticalMs: 2_000,
};

export function isHeartbeatFresh(heartbeatAt: Date, now: Date, staleMs: number) {
  return now.getTime() - heartbeatAt.getTime() <= staleMs;
}

export function requiredProcessTypes(modes: {
  message: string;
  schedule: string;
  broadcast: string;
  campaign: string;
  autoreply: string;
  webhook: string;
}): RuntimeProcessType[] {
  const required: RuntimeProcessType[] = ["WEB"];
  if (modes.message !== "disabled") required.push("MESSAGE_WORKER");
  if (modes.schedule !== "disabled") required.push("SCHEDULE_WORKER");
  if (modes.broadcast !== "disabled") required.push("BROADCAST_WORKER");
  if (modes.campaign !== "disabled") required.push("CAMPAIGN_WORKER");
  if (modes.autoreply !== "disabled") required.push("AUTOREPLY_WORKER");
  if (modes.webhook !== "disabled") required.push("WEBHOOK_WORKER");
  return required;
}

export function evaluateOperationalConditions(input: {
  now: Date;
  requiredProcesses: RuntimeProcessType[];
  heartbeats: HeartbeatView[];
  queues: QueueHealthView[];
  databaseLatencyMs: number;
  disks: Array<{ mount: string; usePercent: number }>;
  thresholds?: OperationalThresholds;
}): OperationalCondition[] {
  const thresholds = input.thresholds ?? DEFAULT_OPERATIONAL_THRESHOLDS;
  const conditions: OperationalCondition[] = [];

  for (const processType of input.requiredProcesses) {
    const candidates = input.heartbeats.filter((item) => item.processType === processType && item.status !== "STOPPING");
    const latest = candidates.sort((a, b) => b.heartbeatAt.getTime() - a.heartbeatAt.getTime())[0];
    if (!latest || !isHeartbeatFresh(latest.heartbeatAt, input.now, thresholds.heartbeatStaleMs)) {
      conditions.push({
        fingerprint: `worker-stale:${processType}`,
        kind: "WORKER_STALE",
        source: processType,
        severity: "CRITICAL",
        title: `${processType} is not reporting`,
        message: latest ? `Last heartbeat is ${input.now.getTime() - latest.heartbeatAt.getTime()} ms old.` : "No runtime heartbeat was found.",
      });
    }
  }

  for (const queue of input.queues) {
    if (queue.deadLetter > 0) {
      conditions.push({
        fingerprint: `queue-dead-letter:${queue.name}`,
        kind: "QUEUE_DEAD_LETTER",
        source: queue.name,
        severity: "WARNING",
        title: `${queue.name} has dead-letter work`,
        message: `${queue.deadLetter} item(s) require operator review.`,
        meta: { deadLetter: queue.deadLetter },
      });
    }
    if (queue.oldestPendingAgeMs !== null && queue.oldestPendingAgeMs >= thresholds.queueWarningAgeMs) {
      const critical = queue.oldestPendingAgeMs >= thresholds.queueCriticalAgeMs;
      conditions.push({
        fingerprint: `queue-stalled:${queue.name}`,
        kind: "QUEUE_STALLED",
        source: queue.name,
        severity: critical ? "CRITICAL" : "WARNING",
        title: `${queue.name} queue is delayed`,
        message: `Oldest pending item is ${queue.oldestPendingAgeMs} ms old.`,
        meta: { oldestPendingAgeMs: queue.oldestPendingAgeMs, pending: queue.pending },
      });
    }
  }

  for (const disk of input.disks) {
    if (disk.usePercent >= thresholds.diskWarningPercent) {
      conditions.push({
        fingerprint: `disk-pressure:${disk.mount}`,
        kind: "DISK_PRESSURE",
        source: disk.mount,
        severity: disk.usePercent >= thresholds.diskCriticalPercent ? "CRITICAL" : "WARNING",
        title: `Disk pressure on ${disk.mount}`,
        message: `Disk usage is ${disk.usePercent.toFixed(1)}%.`,
        meta: { usePercent: disk.usePercent },
      });
    }
  }

  if (input.databaseLatencyMs >= thresholds.databaseWarningMs) {
    conditions.push({
      fingerprint: "database-latency:mysql",
      kind: "DATABASE_LATENCY",
      source: "mysql",
      severity: input.databaseLatencyMs >= thresholds.databaseCriticalMs ? "CRITICAL" : "WARNING",
      title: "Database latency is elevated",
      message: `Readiness query took ${input.databaseLatencyMs} ms.`,
      meta: { latencyMs: input.databaseLatencyMs },
    });
  }

  return conditions;
}
