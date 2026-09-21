import { describe, expect, it } from "vitest";

type CampaignState = "DRAFT" | "QUEUED" | "RUNNING" | "PAUSED" | "CANCELLED";

class DurableCampaignSimulation {
  status: CampaignState = "DRAFT";
  readonly contacts: string[];
  readonly snapshot = new Set<string>();
  readonly broadcasts = new Map<string, Set<string>>();
  private lease: string | null = null;
  private generation = 0;

  constructor(total: number) {
    this.contacts = Array.from({ length: total }, (_, index) => `contact-${index}`);
  }

  activate() {
    if (this.status !== "DRAFT") return false;
    this.status = "QUEUED";
    for (const contact of this.contacts) this.snapshot.add(contact);
    return true;
  }

  mutateContacts() {
    this.contacts.splice(0, 100);
    this.contacts.push(...Array.from({ length: 100 }, (_, index) => `new-${index}`));
  }

  claim(worker: string) {
    if (this.status !== "QUEUED" || this.lease) return null;
    this.lease = `${this.generation}:${worker}`;
    return this.lease;
  }

  materialize(token: string, crash: "BEFORE_COMMIT" | "AFTER_COMMIT" | "NONE") {
    if (this.lease !== token || this.status !== "QUEUED") return "CLAIM_LOST";
    if (crash === "BEFORE_COMMIT") return "CRASH";
    if (!this.broadcasts.has("campaign-1")) this.broadcasts.set("campaign-1", new Set(this.snapshot));
    this.status = "RUNNING";
    this.lease = null;
    return crash === "AFTER_COMMIT" ? "CRASH" : "HANDED_OFF";
  }

  restart() {
    this.generation += 1;
    this.lease = null;
    if (this.broadcasts.has("campaign-1")) this.status = "RUNNING";
  }

  pause() { if (this.status === "QUEUED" || this.status === "RUNNING") { this.status = "PAUSED"; this.lease = null; } }
  resume() { if (this.status === "PAUSED") this.status = this.broadcasts.size ? "RUNNING" : "QUEUED"; }
  cancel() { this.status = "CANCELLED"; this.lease = null; }
}

describe("campaign failure/restart/concurrency simulation", () => {
  it("freezes exactly one 10,000-recipient snapshot under 64 concurrent activations", async () => {
    const state = new DurableCampaignSimulation(10_000);
    const results = await Promise.all(Array.from({ length: 64 }, async () => { await Promise.resolve(); return state.activate(); }));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state.snapshot.size).toBe(10_000);
    state.mutateContacts();
    expect(state.snapshot.has("contact-0")).toBe(true);
    expect(state.snapshot.has("new-0")).toBe(false);
  });

  it("creates one broadcast after repeated pre-commit crashes and a post-commit restart", async () => {
    const state = new DurableCampaignSimulation(2_000);
    state.activate();
    for (let restart = 0; restart < 50; restart += 1) {
      const claims = await Promise.all(Array.from({ length: 16 }, async (_, worker) => { await Promise.resolve(); return state.claim(`worker-${worker}`); }));
      const token = claims.find(Boolean);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(state.materialize(token!, "BEFORE_COMMIT")).toBe("CRASH");
      state.restart();
    }
    const token = state.claim("final-worker")!;
    expect(state.materialize(token, "AFTER_COMMIT")).toBe("CRASH");
    state.restart();
    expect(state.status).toBe("RUNNING");
    expect(state.broadcasts.size).toBe(1);
    expect(state.broadcasts.get("campaign-1")?.size).toBe(2_000);
  });

  it("does not claim new work while paused or after cancellation", () => {
    const state = new DurableCampaignSimulation(100);
    state.activate();
    state.pause();
    expect(state.claim("paused-worker")).toBeNull();
    expect(state.broadcasts.size).toBe(0);
    state.resume();
    expect(state.claim("resumed-worker")).not.toBeNull();
    state.cancel();
    expect(state.claim("cancelled-worker")).toBeNull();
    expect(state.broadcasts.size).toBe(0);
  });
});
