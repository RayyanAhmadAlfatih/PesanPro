import { describe, expect, it } from "vitest";
import { operationalRetentionBoundaries } from "./operations-maintenance";

describe("operational maintenance policy", () => {
  it("keeps seven days of heartbeats and ninety days of resolved alerts", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const boundaries = operationalRetentionBoundaries(now);

    expect(boundaries.heartbeatBefore.toISOString()).toBe("2026-08-29T12:00:00.000Z");
    expect(boundaries.resolvedAlertBefore.toISOString()).toBe("2026-06-07T12:00:00.000Z");
  });
});
