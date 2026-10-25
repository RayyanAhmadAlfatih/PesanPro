import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessSession: vi.fn(),
  resolveTenantId: vi.fn(),
  session: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("./api-auth", () => ({ canAccessSession: mocks.canAccessSession }));
vi.mock("./billing", () => ({
  resolveTenantId: mocks.resolveTenantId,
  requireEntitlement: vi.fn(),
}));
vi.mock("./prisma", () => ({
  prisma: {
    session: { findUnique: mocks.session },
    autoReply: { findMany: mocks.findMany },
  },
}));

import { listAutoReplyRules } from "./autoreply-service";

describe("roadmap L2 auto-reply tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessSession.mockResolvedValue(true);
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.session.mockResolvedValue({ id: "session-b", userId: "tenant-b", sessionId: "device-b" });
  });

  it("[L2-16][L2-20][L2-21] rejects a cross-tenant session before reading or mutating rules", async () => {
    await expect(listAutoReplyRules({ id: "user-a", role: "USER" }, "device-b"))
      .rejects.toMatchObject({ code: "AUTOREPLY_SESSION_NOT_FOUND", status: 404 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
