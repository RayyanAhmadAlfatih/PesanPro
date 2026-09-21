import { describe, expect, it } from "vitest";
import { inspectPrivateMedia } from "./private-media-validation";

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
