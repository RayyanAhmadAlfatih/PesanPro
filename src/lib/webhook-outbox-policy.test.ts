import { describe, expect, it } from "vitest";
import { buildWebhookEventKey, calculateWebhookBackoffMs } from "./webhook-outbox";

describe("webhook outbox policy", () => {
  it("derives a stable bounded event key from an explicit business identity", () => {
    const first = buildWebhookEventKey("message.status", "device-a", { status: "READ" }, "job-1:READ");
    const second = buildWebhookEventKey("message.status", "device-a", { ignored: true }, "job-1:READ");
    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(191);
  });

  it("uses deterministic exponential backoff with bounded jitter", () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) => calculateWebhookBackoffMs(attempt, "delivery-1"));
    expect(delays).toEqual([1, 2, 3, 4, 5].map((attempt) => calculateWebhookBackoffMs(attempt, "delivery-1")));
    expect(delays[0]).toBeGreaterThanOrEqual(2000);
    expect(delays[4]).toBeGreaterThan(delays[0]);
    expect(calculateWebhookBackoffMs(99, "delivery-1")).toBeLessThanOrEqual(18 * 60_000);
  });
});

