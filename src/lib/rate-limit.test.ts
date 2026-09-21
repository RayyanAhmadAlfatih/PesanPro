import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetRateLimitStore } from "./rate-limit";

describe("rate-limit sliding window", () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  it("allows up to limit", () => {
    const key = "test:allow";
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit(key, 5, 60_000);
      expect(r.success).toBe(true);
    }
  });

  it("blocks over limit", () => {
    const key = "test:block";
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
    const r = checkRateLimit(key, 3, 60_000);
    expect(r.success).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("separate keys isolated", () => {
    checkRateLimit("a", 1, 60_000);
    expect(checkRateLimit("a", 1, 60_000).success).toBe(false);
    expect(checkRateLimit("b", 1, 60_000).success).toBe(true);
  });

  it("remaining decreases", () => {
    const r1 = checkRateLimit("c", 3, 60_000);
    expect(r1.remaining).toBe(2);
    const r2 = checkRateLimit("c", 3, 60_000);
    expect(r2.remaining).toBe(1);
  });
});
