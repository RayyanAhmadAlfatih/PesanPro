import { describe, expect, it } from "vitest";
import { decideAutoReplyThrottle } from "./autoreply-throttle";

const policy = { cooldownSeconds: 30, rateLimitCount: 5, rateLimitWindowSeconds: 60, maxChainDepth: 3 };

describe("durable auto-reply throttle policy", () => {
  it("preserves cooldown across a simulated restart", () => {
    const first = decideAutoReplyThrottle(null, policy, new Date("2026-01-01T00:00:00Z"));
    expect(first.allowed).toBe(true);
    const persisted = first.nextState;
    const afterRestart = decideAutoReplyThrottle(persisted, policy, new Date("2026-01-01T00:00:10Z"));
    expect(afterRestart).toMatchObject({ allowed: false, reasonCode: "COOLDOWN_ACTIVE" });
  });

  it("resets the contact window after expiry", () => {
    const old = { windowStartedAt: new Date("2026-01-01T00:00:00Z"), lastTriggeredAt: new Date("2026-01-01T00:00:00Z"), triggerCount: 3 };
    const result = decideAutoReplyThrottle(old, policy, new Date("2026-01-01T00:02:00Z"));
    expect(result).toMatchObject({ allowed: true, chainDepth: 1 });
  });

  it("blocks a reply chain before the broader rate limit", () => {
    const state = { windowStartedAt: new Date("2026-01-01T00:00:00Z"), lastTriggeredAt: new Date("2026-01-01T00:00:30Z"), triggerCount: 3 };
    expect(decideAutoReplyThrottle(state, { ...policy, cooldownSeconds: 0 }, new Date("2026-01-01T00:00:40Z"))).toMatchObject({
      allowed: false,
      reasonCode: "CHAIN_LIMIT_REACHED",
    });
  });
});
