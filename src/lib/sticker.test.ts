import { describe, expect, it } from "vitest";
import sharp from "sharp";
import Sticker from "./sticker";

describe("Sticker", () => {
  it("creates a 512px WebP sticker with WhatsApp EXIF metadata", async () => {
    const input = await sharp({
      create: {
        width: 16,
        height: 8,
        channels: 4,
        background: { r: 22, g: 163, b: 74, alpha: 1 },
      },
    }).png().toBuffer();

    const output = await new Sticker(input, {
      pack: "PesanPro",
      author: "Test",
      type: "full",
      quality: 60,
    }).toBuffer();
    const metadata = await sharp(output).metadata();

    expect(output.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(output.includes(Buffer.from("sticker-pack-name"))).toBe(true);
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it("rejects inputs above the configured size limit", async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(new Sticker(oversized).toBuffer()).rejects.toThrow("10 MB");
  });
});
