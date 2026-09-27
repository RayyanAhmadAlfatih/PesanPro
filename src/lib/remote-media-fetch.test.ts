import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublicBuffer = vi.hoisted(() => vi.fn());

vi.mock("./ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ssrf")>();
  return { ...actual, fetchPublicBuffer };
});

vi.mock("./env", () => ({
  getEnv: () => ({ MAX_UPLOAD_SIZE_MB: 50 }),
}));

import { PublicFetchError } from "./ssrf";
import { fetchRemoteMediaForDelivery } from "./remote-media";

describe("remote media delivery fetch policy", () => {
  beforeEach(() => {
    fetchPublicBuffer.mockReset();
  });

  it("uses the bounded pinned fetch result without persisting it", async () => {
    fetchPublicBuffer.mockResolvedValue({
      buffer: Buffer.from("image"),
      contentType: "image/webp",
      finalUrl: "https://cdn.example.com/final/photo.webp",
    });

    const result = await fetchRemoteMediaForDelivery("IMAGE", {
      mediaUrl: "https://cdn.example.com/start",
    });

    expect(result).toEqual({
      buffer: Buffer.from("image"),
      mimeType: "image/webp",
      fileName: "photo.webp",
    });
    expect(fetchPublicBuffer).toHaveBeenCalledWith("https://cdn.example.com/start", {
      timeoutMs: 15_000,
      maxBytes: 50 * 1024 * 1024,
      maxRedirects: 3,
    });
  });

  it("rejects a response content type that does not match the requested media kind", async () => {
    fetchPublicBuffer.mockResolvedValue({
      buffer: Buffer.from("%PDF"),
      contentType: "application/pdf",
      finalUrl: "https://cdn.example.com/file.pdf",
    });

    await expect(fetchRemoteMediaForDelivery("IMAGE", {
      mediaUrl: "https://cdn.example.com/file.pdf",
    })).rejects.toMatchObject({
      code: "REMOTE_MEDIA_TYPE_MISMATCH",
      retryable: false,
    });
  });

  it("rejects HTML error pages even when sent as a document", async () => {
    fetchPublicBuffer.mockResolvedValue({
      buffer: Buffer.from("<html>login</html>"),
      contentType: "text/html",
      finalUrl: "https://cdn.example.com/login",
    });

    await expect(fetchRemoteMediaForDelivery("DOCUMENT", {
      mediaUrl: "https://cdn.example.com/login",
    })).rejects.toMatchObject({
      code: "REMOTE_MEDIA_TYPE_MISMATCH",
      retryable: false,
    });
  });

  it("maps transient remote failures to retryable message errors", async () => {
    fetchPublicBuffer.mockRejectedValue(new PublicFetchError(
      "REMOTE_FETCH_NETWORK",
      "provider detail",
      true,
    ));

    await expect(fetchRemoteMediaForDelivery("DOCUMENT", {
      mediaUrl: "https://cdn.example.com/report.pdf",
    })).rejects.toMatchObject({
      code: "REMOTE_MEDIA_UNAVAILABLE",
      status: 503,
      retryable: true,
    });
  });
});
