import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import { prepareMediaForStorage } from "./media-optimization";

describe("media optimization", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("MEDIA_IMAGE_WEBP_ENABLED", "true");
    vi.stubEnv("MEDIA_IMAGE_WEBP_QUALITY", "80");
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("converts valid uploaded images to webp storage objects", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#f97316" },
    }).png().toBuffer();

    const prepared = await prepareMediaForStorage(png, "image/png");

    expect(prepared.inspection).toMatchObject({ mediaType: "IMAGE", mimeType: "image/webp", extension: "webp" });
    expect(prepared.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(prepared.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });
});
