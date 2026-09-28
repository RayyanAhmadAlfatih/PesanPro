import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("./billing", () => ({
  resolveTenantId: mocks.resolveTenantId,
  requireEntitlement: vi.fn(),
}));
vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    integrationToken: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { listIntegrationTokens, revokeIntegrationToken } from "./integration-service";

const actor = { id: "user-a", role: "USER" as const, email: "a@example.com" };

describe("roadmap L2 integration token tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
  });

  it("[L2-18] lists only integration tokens from the actor tenant", async () => {
    await listIntegrationTokens(actor);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a" },
    }));
  });

  it("[L2-18][L2-20][L2-21] cannot revoke a guessed token outside the tenant", async () => {
    await expect(revokeIntegrationToken(actor, "token-b"))
      .rejects.toMatchObject({ code: "INTEGRATION_TOKEN_NOT_FOUND", status: 404 });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "token-b", tenantId: "tenant-a", revokedAt: null },
    }));
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
