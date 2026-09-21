import { describe, expect, it } from "vitest";
import { autoReplyWriteSchema } from "./autoreply-input";

const valid = {
  sessionId: "device-one",
  keyword: "halo",
  matchType: "EXACT" as const,
  response: "Selamat datang",
};

describe("auto-reply input", () => {
  it("applies safe defaults", () => {
    const parsed = autoReplyWriteSchema.parse(valid);
    expect(parsed.priority).toBe(100);
    expect(parsed.cooldownSeconds).toBe(30);
    expect(parsed.timezone).toBe("Asia/Jakarta");
  });

  it("requires a response or private media", () => {
    expect(autoReplyWriteSchema.safeParse({ ...valid, response: undefined }).success).toBe(false);
    expect(autoReplyWriteSchema.safeParse({ ...valid, response: undefined, mediaId: "media-1" }).success).toBe(true);
  });

  it("rejects incomplete schedules and duplicate days", () => {
    expect(autoReplyWriteSchema.safeParse({ ...valid, activeStartTime: "08:00" }).success).toBe(false);
    expect(autoReplyWriteSchema.safeParse({ ...valid, activeDays: [1, 1] }).success).toBe(false);
  });

  it("rejects unsafe regex at the API boundary", () => {
    expect(autoReplyWriteSchema.safeParse({ ...valid, matchType: "REGEX", keyword: "(a+)+$" }).success).toBe(false);
    expect(autoReplyWriteSchema.safeParse({ ...valid, matchType: "REGEX", keyword: "^INV-[0-9]{4}$" }).success).toBe(true);
  });

  it("reserves empty keywords for fallback", () => {
    expect(autoReplyWriteSchema.safeParse({ ...valid, keyword: "", matchType: "FALLBACK" }).success).toBe(true);
    expect(autoReplyWriteSchema.safeParse({ ...valid, keyword: "", matchType: "EXACT" }).success).toBe(false);
  });
});
