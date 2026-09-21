import { describe, expect, it } from "vitest";

type Status = "PENDING" | "PROCESSING" | "ENQUEUED";
type CrashPoint = "BEFORE_SNAPSHOT" | "AFTER_SNAPSHOT" | "AFTER_ENQUEUE" | "NONE";
type Event = { id: string; status: Status; lease: string | null; snapshot: boolean };

class DurableAutoReplySimulation {
  enabled = true;
  private sequence = 0;
  private generation = 0;
  readonly events = new Map<string, Event>();
  readonly queue = new Map<string, string>();

  ingest(eventKey: string, fromMe = false) {
    if (fromMe) return null;
    const existing = this.events.get(eventKey);
    if (existing) return existing.id;
    const event = { id: `trigger-${this.sequence++}`, status: "PENDING" as const, lease: null, snapshot: false };
    this.events.set(eventKey, event);
    return event.id;
  }

  claim(worker: string) {
    if (!this.enabled) return null;
    const event = [...this.events.values()].find((item) => item.status === "PENDING" && item.lease === null);
    if (!event) return null;
    event.status = "PROCESSING";
    event.lease = `${this.generation}:${worker}`;
    return { eventId: event.id, token: event.lease };
  }

  process(claim: { eventId: string; token: string }, crash: CrashPoint) {
    const event = [...this.events.values()].find((item) => item.id === claim.eventId);
    if (!event || event.lease !== claim.token || event.status !== "PROCESSING") return "CLAIM_LOST";
    if (crash === "BEFORE_SNAPSHOT") return "CRASH";
    event.snapshot = true;
    if (crash === "AFTER_SNAPSHOT") return "CRASH";
    if (!this.queue.has(event.id)) this.queue.set(event.id, `message-job-${event.id}`);
    if (crash === "AFTER_ENQUEUE") return "CRASH";
    event.status = "ENQUEUED";
    event.lease = null;
    return "ENQUEUED";
  }

  restart() {
    this.generation += 1;
    for (const event of this.events.values()) {
      if (event.status === "PROCESSING") {
        event.status = "PENDING";
        event.lease = null;
      }
    }
  }
}

describe("auto-reply failure/restart/concurrency simulation", () => {
  it("deduplicates 20,000 concurrent deliveries of one inbound event and rejects fromMe", async () => {
    const state = new DurableAutoReplySimulation();
    const ids = await Promise.all(Array.from({ length: 20_000 }, async () => {
      await Promise.resolve();
      return state.ingest("device:message-1");
    }));
    expect(new Set(ids).size).toBe(1);
    expect(state.events.size).toBe(1);
    expect(state.ingest("device:self-message", true)).toBeNull();
    expect(state.events.size).toBe(1);
  });

  it("allows one winner among 128 workers for a single event", async () => {
    const state = new DurableAutoReplySimulation();
    state.ingest("event-1");
    const claims = await Promise.all(Array.from({ length: 128 }, async (_, index) => {
      await Promise.resolve();
      return state.claim(`worker-${index}`);
    }));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("survives repeated crashes at every handoff boundary without duplicate queue jobs", () => {
    const state = new DurableAutoReplySimulation();
    state.ingest("event-1");
    for (let index = 0; index < 25; index += 1) {
      const claim = state.claim(`before-${index}`)!;
      expect(state.process(claim, "BEFORE_SNAPSHOT")).toBe("CRASH");
      state.restart();
    }
    const snapshotted = state.claim("snapshot-worker")!;
    expect(state.process(snapshotted, "AFTER_SNAPSHOT")).toBe("CRASH");
    state.restart();
    for (let index = 0; index < 25; index += 1) {
      const claim = state.claim(`enqueue-${index}`)!;
      expect(state.process(claim, "AFTER_ENQUEUE")).toBe("CRASH");
      state.restart();
    }
    expect(state.queue.size).toBe(1);
    const finalClaim = state.claim("final-worker")!;
    expect(state.process(finalClaim, "NONE")).toBe("ENQUEUED");
    expect(state.queue.size).toBe(1);
  });

  it("processes 5,000 unique events across 32 competing workers exactly once", async () => {
    const state = new DurableAutoReplySimulation();
    for (let index = 0; index < 5_000; index += 1) state.ingest(`event-${index}`);
    await Promise.all(Array.from({ length: 32 }, async (_, worker) => {
      for (;;) {
        const claim = state.claim(`worker-${worker}`);
        if (!claim) return;
        await Promise.resolve();
        expect(state.process(claim, "NONE")).toBe("ENQUEUED");
      }
    }));
    expect(state.queue.size).toBe(5_000);
    expect([...state.events.values()].every((event) => event.status === "ENQUEUED")).toBe(true);
  });

  it("does not claim work while disabled and resumes after restart", () => {
    const state = new DurableAutoReplySimulation();
    state.ingest("event-1");
    state.enabled = false;
    expect(state.claim("disabled-worker")).toBeNull();
    state.restart();
    state.enabled = true;
    expect(state.claim("enabled-worker")).not.toBeNull();
  });
});
