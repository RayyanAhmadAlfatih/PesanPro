import { describe, expect, it } from "vitest";
import { buildRemoteMediaContent, remoteMediaFromRequestPayload } from "./remote-media";

describe("remote WhatsApp media", () => {
  it("builds a webp image from a fetched buffer as a normal image, never as a sticker", () => {
    const buffer = Buffer.from("webp");
    const content = buildRemoteMediaContent("IMAGE", {
      buffer,
      mimeType: "image/webp",
      fileName: "photo.webp",
    }, "caption");

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
  ] as const)("hands %s bytes directly to Baileys via %s", (type, field) => {
    const buffer = Buffer.from(field);
    const content = buildRemoteMediaContent(type, {
      buffer,
      fileName: "report.pdf",
    });
    expect(content).toHaveProperty(field, buffer);
  });

  it("reads only the canonical mediaUrl from durable request payload", () => {
    expect(remoteMediaFromRequestPayload({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg" }))
      .toEqual({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg", mimeType: undefined });
  });
});
