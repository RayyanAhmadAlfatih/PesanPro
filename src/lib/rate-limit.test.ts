import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit, getClientIp, _resetRateLimitStore } from "./rate-limit";

describe("rate-limit sliding window", () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("uses the rightmost client value for one trusted proxy instead of a spoofed first XFF value", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.99, 203.0.113.25",
      "x-real-ip": "203.0.113.25",
    });
    expect(getClientIp(headers)).toBe("203.0.113.25");
  });

  it("walks the forwarding chain from the right for multiple trusted proxies", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.25, 192.0.2.10",
    });
    expect(getClientIp(headers)).toBe("203.0.113.25");
  });

  it("does not trust forwarding headers when proxy trust is disabled", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(getClientIp(new Headers({
      "x-forwarded-for": "203.0.113.25",
      "x-real-ip": "203.0.113.25",
    }))).toBe("unknown");
  });

  it("rejects malformed forwarded IP values", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "attacker.example" }))).toBe("unknown");
  });
});
