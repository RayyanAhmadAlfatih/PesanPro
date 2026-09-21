import { describe, expect, it, vi } from "vitest";
import { RuntimeHeartbeatReporter, type RuntimeHeartbeatRepository } from "./runtime-heartbeat";

describe("runtime heartbeat reporter", () => {
  it("reports startup, healthy state, degradation, recovery, and graceful stop", async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async (_input: Parameters<RuntimeHeartbeatRepository["upsert"]>[0]) => undefined);
    const stop = vi.fn(async (_instanceId: string, _stoppedAt: Date) => undefined);
    const repository: RuntimeHeartbeatRepository = { upsert, stop };
    const reporter = new RuntimeHeartbeatReporter({
      instanceId: "worker-1",
      processType: "MESSAGE_WORKER",
      intervalMs: 1_000,
      repository,
      now: () => new Date("2026-09-05T00:00:00Z"),
    });
    await reporter.start();
    expect(upsert.mock.calls.map(([value]) => value.status)).toEqual(["STARTING", "HEALTHY"]);
    await reporter.reportError("POLL_FAILED", new Error("db unavailable"));
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: "DEGRADED", lastErrorCode: "POLL_FAILED" }));
    await reporter.markHealthy();
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ status: "HEALTHY", lastErrorCode: null }));
    await reporter.stop();
    expect(stop).toHaveBeenCalledWith("worker-1", new Date("2026-09-05T00:00:00Z"));
    vi.useRealTimers();
  });

  it("contains repository failures so observability cannot crash a worker", async () => {
    const repository: RuntimeHeartbeatRepository = {
      upsert: vi.fn(async () => { throw new Error("db down"); }),
      stop: vi.fn(async () => { throw new Error("db down"); }),
    };
    const reporter = new RuntimeHeartbeatReporter({ instanceId: "worker-2", processType: "WEBHOOK_WORKER", intervalMs: 60_000, repository });
    await expect(reporter.start()).resolves.toBeUndefined();
    await expect(reporter.stop()).resolves.toBeUndefined();
  });
});
