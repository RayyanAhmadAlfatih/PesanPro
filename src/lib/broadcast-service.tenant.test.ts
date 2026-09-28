import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("./billing", () => ({
  resolveTenantId: mocks.resolveTenantId,
  requireEntitlement: vi.fn(),
}));
vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    broadcastLog: { findFirst: mocks.findFirst },
  },
}));
vi.mock("./usage", () => ({
  reserveUsage: vi.fn(),
  releaseReservedUsage: vi.fn(),
  commitReservedUsage: vi.fn(),
}));

import { getBroadcast } from "./broadcast-service";

describe("roadmap L2 broadcast tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findFirst.mockResolvedValue(null);
  });

  it("[L2-12][L2-20] scopes guessed broadcasts to tenantId", async () => {
    await expect(getBroadcast({ id: "user-a", role: "USER" }, "broadcast-b"))
      .rejects.toMatchObject({ code: "BROADCAST_NOT_FOUND", status: 404 });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "broadcast-b", tenantId: "tenant-a" },
    }));
  });
});
