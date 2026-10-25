import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./billing", () => ({ resolveTenantId: mocks.resolveTenantId, requireEntitlement: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { messageJob: { findFirst: mocks.findFirst } } }));
vi.mock("./usage", () => ({
  reserveUsage: vi.fn(),
  releaseReservedUsage: vi.fn(),
  commitReservedUsage: vi.fn(),
}));

import { getMessageJob } from "./message-job-service";

describe("roadmap L2 message job tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.findFirst.mockResolvedValue(null);
  });

  it("[L2-11][L2-20] scopes guessed MessageJob IDs to the actor tenant", async () => {
    await expect(getMessageJob({ id: "user-a", role: "USER" }, "job-b"))
      .rejects.toMatchObject({ code: "MESSAGE_JOB_NOT_FOUND", status: 404 });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "job-b", tenantId: "tenant-a" },
    });
  });
});
