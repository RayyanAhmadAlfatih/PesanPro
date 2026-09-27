import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("./billing", () => ({ resolveTenantId: mocks.resolveTenantId }));
vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    segment: { findFirst: mocks.findFirst },
  },
}));

import { getSegment } from "./segment-service";

describe("roadmap L2 segment tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findFirst.mockResolvedValue(null);
  });

  it("[L2-14][L2-20] scopes guessed segments to tenantId", async () => {
    await expect(getSegment({ id: "user-a", role: "USER" }, "segment-b"))
      .rejects.toMatchObject({ code: "SEGMENT_NOT_FOUND", status: 404 });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "segment-b", tenantId: "tenant-a", isActive: true },
    });
  });
});
