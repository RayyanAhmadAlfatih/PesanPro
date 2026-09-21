import { describe, expect, it } from "vitest";
import { validateBroadcastPackageLimits } from "./package-policy";

describe("package broadcast policy", () => {
  it("enforces recipient and delay limits", () => {
    expect(validateBroadcastPackageLimits(
      { recipientCount: 51, delayMinMs: 5_000 },
      { recipientLimit: BigInt(50), minimumDelayMs: BigInt(5_000) },
    )?.code).toBe("BROADCAST_BATCH_LIMIT_EXCEEDED");

    expect(validateBroadcastPackageLimits(
      { recipientCount: 50, delayMinMs: 4_999 },
      { recipientLimit: BigInt(50), minimumDelayMs: BigInt(5_000) },
    )?.code).toBe("BROADCAST_DELAY_TOO_SHORT");

    expect(validateBroadcastPackageLimits(
      { recipientCount: 50, delayMinMs: 5_000 },
      { recipientLimit: BigInt(50), minimumDelayMs: BigInt(5_000) },
    )).toBeNull();
  });

  it("supports unlimited package values", () => {
    expect(validateBroadcastPackageLimits(
      { recipientCount: 10_000, delayMinMs: 2_000 },
      { recipientLimit: null, minimumDelayMs: null },
    )).toBeNull();
  });
});
