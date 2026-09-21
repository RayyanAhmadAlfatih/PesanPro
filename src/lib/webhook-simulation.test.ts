import { describe, expect, it } from "vitest";
import {
  claimSimulatedWebhookDelivery,
  completeSimulatedWebhookDelivery,
  failSimulatedWebhookDelivery,
  recoverSimulatedWebhookWorker,
  type SimulatedWebhookDelivery,
} from "./webhook-simulation";

function pending(maxAttempts = 3): SimulatedWebhookDelivery {
  return { id: "delivery-1", eventId: "event-stable-1", status: "PENDING", attempts: 0, maxAttempts, availableAt: 0, lockedBy: null, leaseExpiresAt: null };
}

describe("webhook failure, restart, and concurrency simulation", () => {
  it("allows only one concurrent worker to claim a delivery", () => {
    const state = pending();
    const first = claimSimulatedWebhookDelivery(state, "worker-a", 1000, 5000);
    const second = claimSimulatedWebhookDelivery(state, "worker-b", 1000, 5000);
    expect(first).toBe("worker-a:1");
    expect(second).toBeNull();
    expect(completeSimulatedWebhookDelivery(state, "worker-b:1")).toBe(false);
    expect(completeSimulatedWebhookDelivery(state, first!)).toBe(true);
  });

  it("retries the same event and delivery identity after a transient failure", () => {
    const state = pending();
    const first = claimSimulatedWebhookDelivery(state, "worker-a", 1000, 5000)!;
    expect(failSimulatedWebhookDelivery(state, first, true, 2000)).toBe(true);
    expect(state.eventId).toBe("event-stable-1");
    expect(claimSimulatedWebhookDelivery(state, "worker-b", 1999, 5000)).toBeNull();
    expect(claimSimulatedWebhookDelivery(state, "worker-b", 2000, 5000)).toBe("worker-b:2");
    expect(state.eventId).toBe("event-stable-1");
  });

  it("recovers a worker claim immediately during graceful restart", () => {
    const state = pending();
    claimSimulatedWebhookDelivery(state, "worker-a", 1000, 5000);
    expect(recoverSimulatedWebhookWorker(state, "worker-b", 1500)).toBe(false);
    expect(recoverSimulatedWebhookWorker(state, "worker-a", 1500)).toBe(true);
    expect(state).toMatchObject({ status: "RETRYING", availableAt: 1500, lockedBy: null });
  });

  it("recovers an expired crash lease and dead-letters at the exact attempt limit", () => {
    const state = pending(2);
    expect(claimSimulatedWebhookDelivery(state, "worker-a", 1000, 5000)).toBeTruthy();
    const second = claimSimulatedWebhookDelivery(state, "worker-b", 6001, 5000)!;
    expect(second).toBe("worker-b:2");
    expect(failSimulatedWebhookDelivery(state, second, true, 7000)).toBe(true);
    expect(state.status).toBe("DEAD_LETTER");
    expect(claimSimulatedWebhookDelivery(state, "worker-c", 8000, 5000)).toBeNull();
  });
});

