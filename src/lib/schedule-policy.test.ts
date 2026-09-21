import { describe, expect, it } from "vitest";
import {
  isMissedRun,
  nextCronOccurrence,
  occurrenceKey,
  parseScheduleLocalDateTime,
  validateCronExpression,
  validateScheduleTimezone,
} from "./schedule-policy";

describe("schedule timezone and recurrence policy", () => {
  it("converts a valid local time to UTC", () => {
    expect(parseScheduleLocalDateTime("2026-08-31T20:00", "Asia/Jakarta").toISOString()).toBe("2026-08-31T13:00:00.000Z");
  });

  it("rejects invalid timezones and spring-forward gaps", () => {
    expect(() => validateScheduleTimezone("Not/A_Zone")).toThrow("valid IANA");
    expect(() => parseScheduleLocalDateTime("2026-03-08T02:30", "America/New_York")).toThrow("does not exist");
  });

  it("calculates cron occurrences in the stored timezone across DST", () => {
    const next = nextCronOccurrence("30 2 * * *", "America/New_York", new Date("2026-03-07T08:00:00.000Z"));
    expect(next.getTime()).toBeGreaterThan(new Date("2026-03-07T08:00:00.000Z").getTime());
    expect(next.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("requires five-field cron and deterministic occurrence keys", () => {
    expect(validateCronExpression("*/5 * * * *", "Asia/Jakarta")).toBe("*/5 * * * *");
    expect(() => validateCronExpression("* * *", "Asia/Jakarta")).toThrow("five fields");
    expect(occurrenceKey(2, new Date("2026-08-31T00:00:00.000Z"))).toBe("v2:2026-08-31T00:00:00.000Z");
  });

  it("uses an explicit grace threshold for missed runs", () => {
    const scheduled = new Date("2026-08-31T00:00:00.000Z");
    expect(isMissedRun(scheduled, new Date("2026-08-31T00:04:59.000Z"), 300)).toBe(false);
    expect(isMissedRun(scheduled, new Date("2026-08-31T00:05:01.000Z"), 300)).toBe(true);
  });
});
