import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { _resetEnvCache } from "./env";
import {
  _resetPrivateMediaStorageForTests,
  _setPrivateMediaStorageTransportForTests,
  deletePrivateMediaObject,
  loadPrivateMediaObject,
  probePrivateMediaStorage,
  resolvePrivateMediaPath,
  storePrivateMediaObject,
} from "./private-media-storage";

const object = Buffer.from("private-media-object");
const localRoot = path.join("/tmp", `pesanpro-b2-fallback-${process.pid}`);

describe("B2 private media storage", () => {
  const get = vi.fn(async (): Promise<Buffer | null> => object);
  const put = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const exists = vi.fn(async () => true);

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("MEDIA_STORAGE_DRIVER", "b2");
    vi.stubEnv("B2_ACCOUNT_ID", "account");
    vi.stubEnv("B2_ACCOUNT_KEY", "key");
    vi.stubEnv("B2_BUCKET", "bucket");
    vi.stubEnv("B2_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    vi.stubEnv("PRIVATE_MEDIA_PATH", localRoot);
    vi.stubEnv("MEDIA_CACHE_MAX_ENTRIES", "100");
    vi.stubEnv("MEDIA_CACHE_MAX_BYTES_MB", "256");
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
    get.mockClear();
    put.mockClear();
    remove.mockClear();
    exists.mockClear();
    _setPrivateMediaStorageTransportForTests({ get, put, delete: remove, exists });
  });

  afterEach(async () => {
    await rm(localRoot, { recursive: true, force: true });
    vi.unstubAllEnvs();
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
  });

  it("deduplicates concurrent B2 reads and keeps later broadcast reads in LRU cache", async () => {
    const loads = Array.from({ length: 100 }, () => loadPrivateMediaObject({ cacheKey: "media-1", storagePath: "tenant/media.webp" }));
    const buffers = await Promise.all(loads);
    expect(buffers.every((buffer) => buffer?.equals(object))).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    await loadPrivateMediaObject({ cacheKey: "media-1", storagePath: "tenant/media.webp" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("probes B2 for readiness instead of trusting local fallback storage", async () => {
    await expect(probePrivateMediaStorage()).resolves.toEqual({ driver: "b2" });
    expect(exists).toHaveBeenCalledWith("__pesanpro_health__/readiness-probe");
  });

  it("writes and deletes B2 objects without persisting a local copy", async () => {
    await storePrivateMediaObject({ storagePath: "tenant/media.webp", buffer: object, mimeType: "image/webp" });
    expect(put).toHaveBeenCalledWith("tenant/media.webp", object, "image/webp");

    await deletePrivateMediaObject({ cacheKey: "media-1", storagePath: "tenant/media.webp" });
    expect(remove).toHaveBeenCalledWith("tenant/media.webp");
  });

  it("falls back to the legacy local file when the object is not migrated yet", async () => {
    get.mockResolvedValueOnce(null);
    const localPath = resolvePrivateMediaPath("tenant/legacy.webp");
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, object);

    const loaded = await loadPrivateMediaObject({ cacheKey: "legacy-1", storagePath: "tenant/legacy.webp" });

    expect(loaded).toEqual(object);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
