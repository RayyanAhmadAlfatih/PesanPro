import { describe, expect, it } from "vitest";
import { buildRemoteMediaContent, remoteMediaFromRequestPayload } from "./remote-media";

describe("remote WhatsApp media", () => {
  it("builds a webp image as a normal image buffer, never as a sticker", () => {
    const buffer = Buffer.from("webp-bytes");
    const content = buildRemoteMediaContent("IMAGE", {
      mediaUrl: "https://cdn.example.com/photo.webp",
      mimeType: "image/webp",
    }, buffer, "caption");

    expect(content).toMatchObject({
      image: buffer,
      mimetype: "image/webp",
      caption: "caption",
    });
    expect(content).not.toHaveProperty("sticker");
  });

  it.each([
    ["VIDEO", "video"],
    ["AUDIO", "audio"],
    ["DOCUMENT", "document"],
  ] as const)("passes transient %s bytes to Baileys via %s", (type, field) => {
    const buffer = Buffer.from(`${field}-bytes`);
    const content = buildRemoteMediaContent(type, {
      mediaUrl: `https://cdn.example.com/${field}`,
      fileName: "report.pdf",
    }, buffer);
    expect(content).toHaveProperty(field, buffer);
  });

  it("reads only the canonical mediaUrl from durable request payload", () => {
    expect(remoteMediaFromRequestPayload({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg" }))
      .toEqual({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg", mimeType: undefined });
  });
});
