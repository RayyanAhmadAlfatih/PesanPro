import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./billing", () => ({ resolveTenantId: mocks.resolveTenantId }));
vi.mock("./prisma", () => ({
  prisma: {
    privateMedia: { findFirst: mocks.findFirst },
  },
}));
vi.mock("./private-media-storage", () => ({
  deletePrivateMediaObject: vi.fn(),
  loadPrivateMediaObject: vi.fn(),
  storePrivateMediaObject: vi.fn(),
  getPrivateMediaRoot: vi.fn(),
  resolvePrivateMediaPath: vi.fn(),
}));
vi.mock("./storage-quota", () => ({ runWithStorageQuota: vi.fn() }));
vi.mock("./media-optimization", () => ({ prepareMediaForStorage: vi.fn() }));
vi.mock("./private-media-lifecycle", () => ({
  activePrivateMediaReferenceCounts: vi.fn(),
  hasActivePrivateMediaReferences: vi.fn(),
}));

import { getPrivateMediaMetadata } from "./private-media";

describe("roadmap L2 private media tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findFirst.mockResolvedValue(null);
  });

  it("[L2-10][L2-20] scopes guessed media IDs to tenantId", async () => {
    await expect(getPrivateMediaMetadata({ id: "user-a", role: "USER" }, "media-b"))
      .rejects.toMatchObject({ code: "MEDIA_NOT_FOUND", status: 404 });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "media-b", tenantId: "tenant-a", status: "ACTIVE" },
    });
  });
});
