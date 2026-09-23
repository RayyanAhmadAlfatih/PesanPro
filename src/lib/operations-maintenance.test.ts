import { describe, expect, it } from "vitest";
import { maskAutoReplyJid } from "./autoreply-privacy";
import { operationalRetentionBoundaries } from "./operations-maintenance";

describe("operational maintenance policy", () => {
  it("keeps seven days of heartbeats, ninety days of resolved alerts, and a bounded auto-reply log window", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const boundaries = operationalRetentionBoundaries(now, 30);

    expect(boundaries.heartbeatBefore.toISOString()).toBe("2026-08-29T12:00:00.000Z");
    expect(boundaries.resolvedAlertBefore.toISOString()).toBe("2026-06-07T12:00:00.000Z");
    expect(boundaries.autoReplyLogBefore.toISOString()).toBe("2026-08-06T12:00:00.000Z");
  });

  it("masks phone-like JIDs before returning trigger logs to the dashboard", () => {
    expect(maskAutoReplyJid("628123456789@s.whatsapp.net")).toBe("628••••789@s.whatsapp.net");
    expect(maskAutoReplyJid("[redacted]")).toBe("[redacted]");
  });
});
