import { describe, expect, it } from "vitest";
import { buildRemoteMediaContent, remoteMediaFromRequestPayload } from "./remote-media";

describe("remote WhatsApp media", () => {
  it("builds a webp image as a normal image URL, never as a sticker", () => {
    const content = buildRemoteMediaContent("IMAGE", {
      mediaUrl: "https://cdn.example.com/photo.webp",
      mimeType: "image/webp",
    }, "caption");

    expect(content).toMatchObject({
      image: { url: "https://cdn.example.com/photo.webp" },
      mimetype: "image/webp",
      caption: "caption",
    });
    expect(content).not.toHaveProperty("sticker");
  });

  it.each([
    ["VIDEO", "video"],
    ["AUDIO", "audio"],
    ["DOCUMENT", "document"],
  ] as const)("passes %s URLs directly to Baileys via %s", (type, field) => {
    const content = buildRemoteMediaContent(type, {
      mediaUrl: `https://cdn.example.com/${field}`,
      fileName: "report.pdf",
    });
    expect(content).toHaveProperty(`${field}.url`, `https://cdn.example.com/${field}`);
  });

  it("reads only the canonical mediaUrl from durable request payload", () => {
    expect(remoteMediaFromRequestPayload({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg" }))
      .toEqual({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg", mimeType: undefined });
  });
});
