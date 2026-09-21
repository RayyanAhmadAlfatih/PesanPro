import { createHash } from "node:crypto";
import { evaluateOperationalConditions, type OperationalCondition } from "./operational-policy";

export function simulateConcurrentIdempotency(requests: Array<{ key: string; payload: string }>) {
  const jobs = new Map<string, { hash: string; jobId: string }>();
  let conflicts = 0;
  let idempotentReplays = 0;
  for (const request of requests) {
    const hash = createHash("sha256").update(request.payload).digest("hex");
    const existing = jobs.get(request.key);
    if (!existing) jobs.set(request.key, { hash, jobId: `job-${jobs.size + 1}` });
    else if (existing.hash === hash) idempotentReplays += 1;
    else conflicts += 1;
  }
  return { jobs: jobs.size, conflicts, idempotentReplays };
}

export function deduplicateConditions(scans: OperationalCondition[][]) {
  const state = new Map<string, { occurrences: number; severity: string }>();
  for (const scan of scans) {
    for (const condition of scan) {
      const current = state.get(condition.fingerprint);
      state.set(condition.fingerprint, { occurrences: (current?.occurrences ?? 0) + 1, severity: condition.severity });
    }
  }
  return state;
}

export function runOperationalLoadSimulation(iterations: number) {
  const now = new Date("2026-09-05T00:00:00Z");
  let generated = 0;
  for (let index = 0; index < iterations; index += 1) {
    generated += evaluateOperationalConditions({
      now,
      requiredProcesses: ["WEB", "MESSAGE_WORKER"],
      heartbeats: [
        { instanceId: `web-${index}`, processType: "WEB", status: "HEALTHY", heartbeatAt: now },
        { instanceId: `worker-${index}`, processType: "MESSAGE_WORKER", status: "HEALTHY", heartbeatAt: now },
      ],
      queues: [{ name: "messages", pending: index % 7, processing: index % 2, deadLetter: 0, oldestPendingAgeMs: null }],
      databaseLatencyMs: 10,
      disks: [{ mount: "/", usePercent: 30 }],
    }).length;
  }
  return { iterations, generated };
}
