import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import { parsePrivateMediaUpload } from "./private-media-upload";

const REQUIRED_ENV = {
  DATABASE_URL: "mysql://user:password@127.0.0.1:3306/pesanpro",
  AUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: "b".repeat(64),
};

describe("private media multipart parser", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(REQUIRED_ENV)) vi.stubEnv(name, value);
    vi.stubEnv("MAX_UPLOAD_SIZE_MB", "1");
    vi.stubEnv("MAX_CONCURRENT_MEDIA_UPLOADS", "2");
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("PASSWORD_RESET_BASE_URL", "");
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("streams one file and its optional session field", async () => {
    const form = new FormData();
    form.set("file", new File(["%PDF-1.7\nbody"], "invoice.pdf", { type: "application/pdf" }));
    form.set("sessionId", "device-1");

    const parsed = await parsePrivateMediaUpload(new Request("http://localhost/api/v1/media", { method: "POST", body: form }));

    expect(parsed.originalName).toBe("invoice.pdf");
    expect(parsed.declaredMimeType).toBe("application/pdf");
    expect(parsed.sessionPublicId).toBe("device-1");
    expect(parsed.buffer.toString()).toBe("%PDF-1.7\nbody");
  });

  it("rejects a declared request larger than the bounded body allowance", async () => {
    const request = new Request("http://localhost/api/v1/media", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(3 * 1024 * 1024),
      },
      body: "--test--\r\n",
    });

    await expect(parsePrivateMediaUpload(request)).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE", status: 413 });
  });

  it("rejects a streamed file after it crosses the file limit", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));

    await expect(parsePrivateMediaUpload(new Request("http://localhost/api/v1/media", { method: "POST", body: form })))
      .rejects.toMatchObject({ code: "MEDIA_TOO_LARGE", status: 413 });
  });

  it("rejects non-multipart uploads", async () => {
    const request = new Request("http://localhost/api/v1/media", { method: "POST", body: "raw" });
    await expect(parsePrivateMediaUpload(request)).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT_TYPE", status: 415 });
  });
});
