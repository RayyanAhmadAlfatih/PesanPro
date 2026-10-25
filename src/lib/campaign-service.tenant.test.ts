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
    campaign: { findFirst: mocks.findFirst },
  },
}));
vi.mock("./usage", () => ({
  reserveUsage: vi.fn(),
  releaseReservedUsage: vi.fn(),
  commitReservedUsage: vi.fn(),
}));

import { getCampaign } from "./campaign-service";

describe("roadmap L2 campaign tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findFirst.mockResolvedValue(null);
  });

  it("[L2-13][L2-20] scopes guessed campaigns to tenantId", async () => {
    await expect(getCampaign({ id: "user-a", role: "USER" }, "campaign-b"))
      .rejects.toMatchObject({ code: "CAMPAIGN_NOT_FOUND", status: 404 });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "campaign-b", tenantId: "tenant-a" },
    }));
  });
});
