import { describe, expect, it } from "vitest";
import { getUsagePeriod } from "./usage";

describe("subscription-aligned usage periods", () => {
  it("aligns monthly periods to the subscription start day", () => {
    const period = getUsagePeriod(
      new Date("2026-01-15T08:30:00.000Z"),
      new Date("2026-08-29T00:00:00.000Z"),
    );
    expect(period.start.toISOString()).toBe("2026-08-15T08:30:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-15T08:30:00.000Z");
  });

  it("uses the previous anniversary before the current month's billing day", () => {
    const period = getUsagePeriod(
      new Date("2026-01-20T00:00:00.000Z"),
      new Date("2026-08-10T00:00:00.000Z"),
    );
    expect(period.start.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("clamps month-end subscriptions without drifting", () => {
    const february = getUsagePeriod(
      new Date("2026-01-31T00:00:00.000Z"),
      new Date("2026-02-28T12:00:00.000Z"),
    );
    expect(february.start.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(february.end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});
