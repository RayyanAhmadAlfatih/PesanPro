import { describe, expect, it } from "vitest";

type SimRecipient = { id: string; status: "PENDING" | "DONE" };
type SimClaim = { token: string; recipientId: string };

class DurableBroadcastSimulation {
  readonly recipients: SimRecipient[];
  readonly queueJobs = new Set<string>();
  readonly enqueueAttempts = new Map<string, number>();
  readonly crashedAfterEnqueue = new Set<string>();
  readonly crashedBeforeEnqueue = new Set<string>();
  private owner: { token: string; recipientId: string; expiresAt: number } | null = null;
  private tick = 0;
  private generation = 0;
  private activeClaims = 0;
  maxConcurrentClaims = 0;
  paused = false;

  constructor(total: number) {
    this.recipients = Array.from({ length: total }, (_, position) => ({ id: `recipient-${position}`, status: "PENDING" }));
  }

  claim(workerId: string): SimClaim | null {
    this.tick += 1;
    if (this.paused) return null;
    if (this.owner && this.owner.expiresAt <= this.tick) {
      this.owner = null;
      this.activeClaims = 0;
    }
    if (this.owner) return null;
    const recipient = this.recipients.find((item) => item.status === "PENDING");
    if (!recipient) return null;
    const token = `${this.generation}:${workerId}:${this.tick}`;
    this.owner = { token, recipientId: recipient.id, expiresAt: this.tick + 50 };
    this.activeClaims += 1;
    this.maxConcurrentClaims = Math.max(this.maxConcurrentClaims, this.activeClaims);
    return { token, recipientId: recipient.id };
  }

  enqueue(recipientId: string) {
    this.enqueueAttempts.set(recipientId, (this.enqueueAttempts.get(recipientId) ?? 0) + 1);
    this.queueJobs.add(recipientId);
  }

  finalize(claim: SimClaim) {
    if (this.paused || this.owner?.token !== claim.token || this.owner.recipientId !== claim.recipientId) return false;
    const recipient = this.recipients.find((item) => item.id === claim.recipientId);
    if (!recipient || recipient.status !== "PENDING") return false;
    recipient.status = "DONE";
    this.owner = null;
    this.activeClaims = 0;
    return true;
  }

  restart() {
    this.generation += 1;
    this.tick += 100;
  }

  pause() {
    this.paused = true;
    this.owner = null;
    this.activeClaims = 0;
  }

  resume() {
    this.paused = false;
    this.generation += 1;
  }

  get completed() {
    return this.recipients.filter((recipient) => recipient.status === "DONE").length;
  }

  get isComplete() {
    return this.completed === this.recipients.length;
  }
}

async function concurrentRound(
  state: DurableBroadcastSimulation,
  workerCount: number,
  options: { injectCrashes?: boolean; pauseAt?: number } = {},
) {
  let outcome: "COMPLETE" | "CRASH" | "PAUSED" | null = null;
  let iterations = 0;
  const worker = async (workerId: string) => {
    while (!outcome && iterations < 100_000) {
      iterations += 1;
      const claim = state.claim(workerId);
      if (!claim) {
        if (state.isComplete) outcome = "COMPLETE";
        else if (state.paused) outcome = "PAUSED";
        await Promise.resolve();
        continue;
      }
      await Promise.resolve();
      const position = Number(claim.recipientId.slice("recipient-".length));
      if (options.injectCrashes && position % 23 === 7 && !state.crashedBeforeEnqueue.has(claim.recipientId)) {
        state.crashedBeforeEnqueue.add(claim.recipientId);
        outcome = "CRASH";
        return;
      }
      state.enqueue(claim.recipientId);
      if (options.injectCrashes && position % 17 === 3 && !state.crashedAfterEnqueue.has(claim.recipientId)) {
        state.crashedAfterEnqueue.add(claim.recipientId);
        outcome = "CRASH";
        return;
      }
      await Promise.resolve();
      state.finalize(claim);
      if (options.pauseAt && state.completed === options.pauseAt) {
        state.pause();
        outcome = "PAUSED";
        return;
      }
      if (state.isComplete) outcome = "COMPLETE";
    }
  };
  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(`worker-${index}`)));
  if (!outcome) throw new Error("Concurrency simulation exceeded its safety limit");
  return outcome;
}

describe("broadcast failure/restart/concurrency simulation", () => {
  it("survives repeated crashes before and after enqueue across eight worker restarts", async () => {
    const state = new DurableBroadcastSimulation(250);
    let restarts = 0;
    while (!state.isComplete) {
      const outcome = await concurrentRound(state, 8, { injectCrashes: true });
      if (outcome === "CRASH") {
        restarts += 1;
        state.restart();
      }
    }

    expect(restarts).toBeGreaterThan(20);
    expect(state.crashedBeforeEnqueue.size).toBeGreaterThan(0);
    expect(state.crashedAfterEnqueue.size).toBeGreaterThan(0);
    expect(state.completed).toBe(250);
    expect(state.queueJobs.size).toBe(250);
    expect([...state.enqueueAttempts.values()].some((attempts) => attempts > 1)).toBe(true);
    expect(state.maxConcurrentClaims).toBe(1);
  });

  it("halts all workers while paused and completes after a clean resume", async () => {
    const state = new DurableBroadcastSimulation(120);
    await expect(concurrentRound(state, 12, { pauseAt: 30 })).resolves.toBe("PAUSED");
    const completedAtPause = state.completed;

    await expect(concurrentRound(state, 12)).resolves.toBe("PAUSED");
    expect(state.completed).toBe(completedAtPause);
    expect(state.queueJobs.size).toBe(completedAtPause);

    state.resume();
    await expect(concurrentRound(state, 12)).resolves.toBe("COMPLETE");
    expect(state.completed).toBe(120);
    expect(state.queueJobs.size).toBe(120);
    expect(state.maxConcurrentClaims).toBe(1);
  });
});
