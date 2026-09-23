import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTenantId: vi.fn(),
  contactTagCount: vi.fn(),
  segmentCreate: vi.fn(),
}));

vi.mock("./billing", () => ({ resolveTenantId: mocks.resolveTenantId }));
vi.mock("./api-auth", () => ({ canAccessSession: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    contactTag: { count: mocks.contactTagCount },
    segment: { create: mocks.segmentCreate },
  },
}));

import { createSegment } from "./segment-service";

const actor = { id: "user-a", role: "USER" as const };
const definition = {
  consentStatuses: [],
  tagIds: ["tag-from-another-tenant"],
  labelIds: [],
  sources: [],
  attributes: [],
};

describe("segment reference validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.contactTagCount.mockResolvedValue(0);
  });

  it("rejects stale or foreign tag IDs before a segment is saved", async () => {
    await expect(createSegment(actor, { name: "Foreign tag", definition }))
      .rejects.toMatchObject({ code: "INVALID_SEGMENT_TAG", status: 422 });
    expect(mocks.contactTagCount).toHaveBeenCalledWith({
      where: { id: { in: ["tag-from-another-tenant"] }, tenantId: "tenant-a" },
    });
    expect(mocks.segmentCreate).not.toHaveBeenCalled();
  });
});
