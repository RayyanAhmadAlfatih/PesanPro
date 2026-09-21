import { describe, expect, it } from "vitest";
import { evaluateOperationalConditions, isHeartbeatFresh, requiredProcessTypes } from "./operational-policy";

const now = new Date("2026-09-05T00:10:00.000Z");

describe("operational readiness and alert policy", () => {
  it("requires every enabled worker and ignores disabled workers", () => {
    expect(requiredProcessTypes({ message: "external", schedule: "embedded", broadcast: "disabled", campaign: "external", autoreply: "external", webhook: "external" }))
      .toEqual(["WEB", "MESSAGE_WORKER", "SCHEDULE_WORKER", "CAMPAIGN_WORKER", "AUTOREPLY_WORKER", "WEBHOOK_WORKER"]);
  });

  it("uses an inclusive stale boundary", () => {
    expect(isHeartbeatFresh(new Date(now.getTime() - 90_000), now, 90_000)).toBe(true);
    expect(isHeartbeatFresh(new Date(now.getTime() - 90_001), now, 90_000)).toBe(false);
  });

  it("detects worker loss, queue delay, dead letter, disk pressure, and DB latency", () => {
    const alerts = evaluateOperationalConditions({
      now,
      requiredProcesses: ["WEB", "MESSAGE_WORKER"],
      heartbeats: [{ instanceId: "web-1", processType: "WEB", status: "HEALTHY", heartbeatAt: new Date(now.getTime() - 1_000) }],
      queues: [{ name: "messages", pending: 12, processing: 1, deadLetter: 2, oldestPendingAgeMs: 31 * 60_000 }],
      databaseLatencyMs: 2_500,
      disks: [{ mount: "/", usePercent: 92 }],
    });
    expect(alerts.map((item) => item.fingerprint)).toEqual(expect.arrayContaining([
      "worker-stale:MESSAGE_WORKER",
      "queue-dead-letter:messages",
      "queue-stalled:messages",
      "disk-pressure:/",
      "database-latency:mysql",
    ]));
    expect(alerts.filter((item) => item.severity === "CRITICAL")).toHaveLength(4);
  });

  it("returns no condition for healthy local state", () => {
    expect(evaluateOperationalConditions({
      now,
      requiredProcesses: ["WEB"],
      heartbeats: [{ instanceId: "web-1", processType: "WEB", status: "HEALTHY", heartbeatAt: now }],
      queues: [{ name: "messages", pending: 0, processing: 0, deadLetter: 0, oldestPendingAgeMs: null }],
      databaseLatencyMs: 20,
      disks: [{ mount: "/", usePercent: 20 }],
    })).toEqual([]);
  });
});
