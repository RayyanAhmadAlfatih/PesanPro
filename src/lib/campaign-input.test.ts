import { describe, expect, it } from "vitest";
import { campaignActivationSchema, campaignWriteSchema } from "./campaign-input";

const valid = { name: "August campaign", primarySessionId: "device-primary", segmentId: "segment-1", message: "Hello" };

describe("campaign input", () => {
  it("requires a distinct fallback device when fallback is enabled", () => {
    expect(() => campaignWriteSchema.parse({ ...valid, fallbackPolicy: "USE_FALLBACK" })).toThrow();
    expect(() => campaignWriteSchema.parse({ ...valid, fallbackPolicy: "USE_FALLBACK", fallbackSessionId: "device-primary" })).toThrow();
  });

  it("enforces the safe delay interval", () => {
    expect(() => campaignWriteSchema.parse({ ...valid, delayMinMs: 20_000, delayMaxMs: 10_000 })).toThrow();
    expect(campaignWriteSchema.parse({ ...valid }).delayMinMs).toBe(10_000);
  });

  it("requires local time and timezone as an atomic schedule pair", () => {
    expect(() => campaignActivationSchema.parse({ localDateTime: "2026-09-02T09:00" })).toThrow();
    expect(campaignActivationSchema.parse({ localDateTime: "2026-09-02T09:00", timezone: "Asia/Jakarta" })).toBeTruthy();
  });
});
