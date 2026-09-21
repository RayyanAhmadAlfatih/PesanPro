import { describe, expect, it } from "vitest";
import { deduplicateConditions, runOperationalLoadSimulation, simulateConcurrentIdempotency } from "./phase9-simulation";

describe("Phase 9 restart, concurrency, and load simulations", () => {
  it("collapses 500 concurrent-equivalent form retries into one job", () => {
    const result = simulateConcurrentIdempotency(Array.from({ length: 500 }, () => ({ key: "cf7-submission-1", payload: '{"message":"same"}' })));
    expect(result).toEqual({ jobs: 1, conflicts: 0, idempotentReplays: 499 });
  });

  it("rejects payload changes under an existing idempotency key", () => {
    const result = simulateConcurrentIdempotency([
      { key: "google-response-1", payload: "first" },
      ...Array.from({ length: 99 }, () => ({ key: "google-response-1", payload: "changed" })),
    ]);
    expect(result).toEqual({ jobs: 1, conflicts: 99, idempotentReplays: 0 });
  });

  it("deduplicates repeated alert scans while preserving occurrence count", () => {
    const condition = { fingerprint: "worker-stale:WEBHOOK_WORKER", kind: "WORKER_STALE", source: "WEBHOOK_WORKER", severity: "CRITICAL" as const, title: "stale", message: "stale" };
    const state = deduplicateConditions(Array.from({ length: 20 }, () => [condition]));
    expect(state.size).toBe(1);
    expect(state.get(condition.fingerprint)).toEqual({ occurrences: 20, severity: "CRITICAL" });
  });

  it("evaluates 10,000 healthy snapshots without state leakage", () => {
    expect(runOperationalLoadSimulation(10_000)).toEqual({ iterations: 10_000, generated: 0 });
  });
});
