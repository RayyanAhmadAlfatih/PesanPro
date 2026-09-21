import { describe, expect, it } from "vitest";
import { calculateMessageRetryDelay } from "./message-queue-policy";
import { classifyMessageDispatchError, MessageJobError } from "./message-job-errors";

describe("message queue retry policy", () => {
  it("uses capped exponential backoff", () => {
    expect(calculateMessageRetryDelay(1, () => 0)).toBe(2_000);
    expect(calculateMessageRetryDelay(2, () => 0)).toBe(4_000);
    expect(calculateMessageRetryDelay(20, () => 0)).toBe(15 * 60_000);
  });

  it("adds bounded positive jitter", () => {
    expect(calculateMessageRetryDelay(1, () => 1)).toBe(2_400);
  });

  it("distinguishes retryable and permanent dispatch errors", () => {
    expect(classifyMessageDispatchError(new Error("network timeout")).retryable).toBe(true);
    expect(classifyMessageDispatchError(new Error("invalid recipient jid")).retryable).toBe(false);
    const known = new MessageJobError("KNOWN", "Safe", 422, false);
    expect(classifyMessageDispatchError(known)).toBe(known);
  });
});
