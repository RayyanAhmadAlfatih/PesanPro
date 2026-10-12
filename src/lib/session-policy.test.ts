import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_ABSOLUTE_MAX_HOURS,
  DEFAULT_SESSION_TIMEOUT_HOURS,
  hoursToMs,
  isSessionAbsolutelyExpired,
  resolveSessionAbsoluteMaxHours,
  resolveSessionTimeoutHours,
  sessionUpdateAgeSeconds,
} from "./session-policy";

describe("session policy", () => {
  it("falls back to the documented defaults when the env var is missing or blank", () => {
    expect(resolveSessionTimeoutHours(undefined)).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("   ")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionAbsoluteMaxHours(undefined)).toBe(DEFAULT_SESSION_ABSOLUTE_MAX_HOURS);
  });

  it("rejects values outside the allowed range instead of trusting them", () => {
    expect(resolveSessionTimeoutHours("0")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("-5")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("99999")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("abc")).toBe(DEFAULT_SESSION_TIMEOUT_HOURS);
    expect(resolveSessionTimeoutHours("12.7")).toBe(12);
  });

  it("accepts an in-range override", () => {
    expect(resolveSessionTimeoutHours("8")).toBe(8);
    expect(resolveSessionAbsoluteMaxHours("720")).toBe(720);
  });

  it("keeps the refresh interval below the idle window so the window can slide", () => {
    const maxAgeSeconds = 24 * 60 * 60;
    const updateAge = sessionUpdateAgeSeconds(maxAgeSeconds);
    expect(updateAge).toBeLessThan(maxAgeSeconds);
    expect(updateAge).toBe(60 * 60);
    // A short window must still refresh more often than once per hour.
    expect(sessionUpdateAgeSeconds(60 * 60)).toBe(15 * 60);
    expect(sessionUpdateAgeSeconds(60)).toBe(60);
  });

  it("expires a session only once the absolute ceiling is reached", () => {
    const startedAt = Date.parse("2026-10-12T00:00:00.000Z");
    const sevenDays = hoursToMs(168);
    expect(isSessionAbsolutelyExpired(startedAt, startedAt, sevenDays)).toBe(false);
    expect(isSessionAbsolutelyExpired(startedAt, startedAt + sevenDays - 1, sevenDays)).toBe(false);
    expect(isSessionAbsolutelyExpired(startedAt, startedAt + sevenDays, sevenDays)).toBe(true);
  });

  it("treats a session with no start time as not yet expired", () => {
    expect(isSessionAbsolutelyExpired(undefined, Date.now(), hoursToMs(168))).toBe(false);
    expect(isSessionAbsolutelyExpired(null, Date.now(), hoursToMs(168))).toBe(false);
    expect(isSessionAbsolutelyExpired(Number.NaN, Date.now(), hoursToMs(168))).toBe(false);
  });
});
