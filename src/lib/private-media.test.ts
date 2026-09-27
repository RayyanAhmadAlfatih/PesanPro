import { describe, expect, it } from "vitest";
import { inspectPrivateMedia } from "./private-media-validation";
import { hasActivePrivateMediaReferences, PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES } from "./private-media-lifecycle";

describe("private media content validation", () => {
  it("accepts content whose magic bytes match its declared MIME", () => {
    expect(inspectPrivateMedia(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg").mediaType).toBe("IMAGE");
    expect(inspectPrivateMedia(Buffer.from("%PDF-1.7\n"), "application/pdf").mediaType).toBe("DOCUMENT");
    expect(inspectPrivateMedia(Buffer.from("OggSdata"), "audio/ogg").mediaType).toBe("AUDIO");
  });

  it("rejects MIME spoofing and unsupported formats", () => {
    expect(() => inspectPrivateMedia(Buffer.from("not a png"), "image/png")).toThrow("do not match");
    expect(() => inspectPrivateMedia(Buffer.from("GIF89a"), "image/gif")).toThrow("not supported");
  });
});

describe("private media reference policy", () => {
  it("protects retryable and resumable states", () => {
    expect(PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES).toEqual({
      messageJobs: ["QUEUED", "PROCESSING", "FAILED"],
      scheduledMessages: ["ACTIVE", "FAILED"],
      broadcasts: ["DRAFT", "QUEUED", "RUNNING", "PAUSED", "FAILED"],
      campaigns: ["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "FAILED"],
    });
  });

  it("protects every durable workflow that can still use media", () => {
    for (const key of ["messageJobs", "scheduledMessages", "broadcasts", "campaignVersions", "autoReplies"] as const) {
      const counts = { messageJobs: 0, scheduledMessages: 0, broadcasts: 0, campaignVersions: 0, autoReplies: 0 };
      counts[key] = 1;
      expect(hasActivePrivateMediaReferences(counts)).toBe(true);
    }
  });

  it("allows cleanup only when no active workflow references media", () => {
    expect(hasActivePrivateMediaReferences({
      messageJobs: 0,
      scheduledMessages: 0,
      broadcasts: 0,
      campaignVersions: 0,
      autoReplies: 0,
    })).toBe(false);
  });
});
