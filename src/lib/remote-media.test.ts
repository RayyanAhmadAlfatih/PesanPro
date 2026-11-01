import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageJobError } from "./message-job-errors";
import { SSRFError } from "./ssrf";

const safeFetchBufferMock = vi.fn();

vi.mock("./ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ssrf")>();
  return {
    ...actual,
    safeFetchBuffer: (...args: unknown[]) => safeFetchBufferMock(...(args as [])),
  };
});

const { buildRemoteMediaContent, fetchRemoteMediaBuffer, remoteMediaFromRequestPayload } = await import("./remote-media");

describe("remote WhatsApp media", () => {
  beforeEach(() => {
    safeFetchBufferMock.mockReset();
  });

  it("builds image content from the downloaded buffer, never from a raw URL", () => {
    const buffer = Buffer.from("fake-image-bytes");
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
  ] as const)("sends the %s buffer to Baileys via %s", (type, field) => {
    const buffer = Buffer.from("bytes");
    const content = buildRemoteMediaContent(type, {
      mediaUrl: "https://cdn.example.com/file",
      fileName: "report.pdf",
    }, buffer);
    expect(content).toHaveProperty(field, buffer);
  });

  it("downloads remote media through the SSRF-guarded fetcher with a size cap", async () => {
    const buffer = Buffer.from("payload");
    safeFetchBufferMock.mockResolvedValue(buffer);
    // IP-literal URL: no DNS lookup, so the real validatePublicUrl passes.
    const url = "https://93.184.216.34/a.jpg";

    await expect(fetchRemoteMediaBuffer({ mediaUrl: url })).resolves.toBe(buffer);
    expect(safeFetchBufferMock).toHaveBeenCalledWith(url, expect.objectContaining({
      maxBytes: expect.any(Number),
      maxRedirects: expect.any(Number),
    }));
  });

  it("maps SSRF rejection to a non-retryable invalid-URL job error", async () => {
    safeFetchBufferMock.mockRejectedValue(new SSRFError("Private IP blocked"));

    await expect(fetchRemoteMediaBuffer({ mediaUrl: "https://attacker.example/x.jpg" }))
      .rejects.toMatchObject({ code: "INVALID_MEDIA_URL", retryable: false } satisfies Partial<MessageJobError>);
  });

  it("maps download failure to a retryable job error", async () => {
    safeFetchBufferMock.mockRejectedValue(new Error("HTTP 502 Bad Gateway"));

    await expect(fetchRemoteMediaBuffer({ mediaUrl: "https://93.184.216.34/a.jpg" }))
      .rejects.toMatchObject({ code: "REMOTE_MEDIA_FETCH_FAILED", retryable: true } satisfies Partial<MessageJobError>);
  });

  it("reads only the canonical mediaUrl from durable request payload", () => {
    expect(remoteMediaFromRequestPayload({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg" }))
      .toEqual({ mediaUrl: "https://cdn.example.com/image.jpg", fileName: "image.jpg", mimeType: undefined });
  });
});
