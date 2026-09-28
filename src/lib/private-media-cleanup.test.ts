import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  deleteObject: vi.fn(),
  releaseQuota: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    privateMediaCleanup: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("./private-media-storage", () => ({
  deletePrivateMediaObject: mocks.deleteObject,
}));

vi.mock("./storage-quota", () => ({
  releaseStorageQuota: mocks.releaseQuota,
}));

import {
  calculatePrivateMediaCleanupBackoffMs,
  finalizePrivateMediaCleanup,
  processPendingPrivateMediaCleanup,
} from "./private-media-cleanup";

const now = new Date("2026-09-27T09:00:00.000Z");

function cleanup(overrides: Record<string, unknown> = {}) {
  return {
    id: "cleanup-1",
    mediaId: "media-1",
    tenantId: "tenant-1",
    uploaderId: "user-1",
    sessionId: "session-db-1",
    storagePath: "tenant-1/media-1.webp",
    storedName: "media-1.webp",
    sizeBytes: BigInt(1024),
    status: "PENDING",
    availableAt: now,
    attempts: 0,
    storageDeletedAt: null,
    quotaReleasedAt: null,
    completedAt: null,
    safeErrorCode: null,
    safeErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("durable private media cleanup", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.releaseQuota.mockResolvedValue({ released: BigInt(1024), idempotent: false });
  });

  it("recovers a tombstone left after a process crash before object cleanup", async () => {
    mocks.findUnique.mockResolvedValue(cleanup());

    await expect(finalizePrivateMediaCleanup("media-1", now)).resolves.toMatchObject({
      completed: true,
    });

    expect(mocks.deleteObject).toHaveBeenCalledWith({
      cacheKey: "media-1",
      storagePath: "tenant-1/media-1.webp",
    });
    expect(mocks.releaseQuota).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      bytes: 1024,
      idempotencyKey: "private-media-cleanup:media-1",
    }));
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED", completedAt: now }),
    }));
  });

  it("keeps cleanup pending with backoff when B2 deletion fails", async () => {
    mocks.findUnique.mockResolvedValue(cleanup());
    mocks.deleteObject.mockRejectedValue(new Error("B2 timeout"));

    const result = await finalizePrivateMediaCleanup("media-1", now);

    expect(result).toMatchObject({
      completed: false,
      errorCode: "STORAGE_DELETE_FAILED",
    });
    expect(mocks.releaseQuota).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        attempts: { increment: 1 },
        safeErrorCode: "STORAGE_DELETE_FAILED",
        safeErrorMessage: "Private media cleanup will be retried",
      }),
    }));
  });

  it("resumes after object deletion without deleting the object twice", async () => {
    mocks.findUnique.mockResolvedValue(cleanup({ storageDeletedAt: new Date("2026-09-27T08:59:00.000Z") }));

    await finalizePrivateMediaCleanup("media-1", now);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.releaseQuota).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETED" }),
    }));
  });

  it("skips quota release when the durable marker already confirms it", async () => {
    mocks.findUnique.mockResolvedValue(cleanup({
      storageDeletedAt: new Date("2026-09-27T08:58:00.000Z"),
      quotaReleasedAt: new Date("2026-09-27T08:59:00.000Z"),
    }));

    await finalizePrivateMediaCleanup("media-1", now);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.releaseQuota).not.toHaveBeenCalled();
  });

  it("retries pending tombstones selected by maintenance", async () => {
    mocks.findMany.mockResolvedValue([{ mediaId: "media-1" }]);
    mocks.findUnique.mockResolvedValue(cleanup());

    await expect(processPendingPrivateMediaCleanup(now, 10)).resolves.toEqual({
      scanned: 1,
      completed: 1,
      pending: 0,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PENDING", availableAt: { lte: now } },
      take: 10,
    }));
  });

  it("uses bounded exponential retry delays", () => {
    expect(calculatePrivateMediaCleanupBackoffMs(1)).toBe(30_000);
    expect(calculatePrivateMediaCleanupBackoffMs(2)).toBe(60_000);
    expect(calculatePrivateMediaCleanupBackoffMs(100)).toBe(6 * 60 * 60_000);
  });
});
