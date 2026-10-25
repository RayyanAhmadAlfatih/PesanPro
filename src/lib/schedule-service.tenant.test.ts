import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessSession: vi.fn(),
  session: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("./api-auth", () => ({ canAccessSession: mocks.canAccessSession }));
vi.mock("./billing", () => ({ resolveTenantId: vi.fn(async () => "tenant-a"), requireEntitlement: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: {
    session: { findUnique: mocks.session },
    scheduledMessage: { findFirst: mocks.schedule },
  },
}));
vi.mock("./usage", () => ({ reserveUsage: vi.fn(), releaseReservedUsage: vi.fn(), commitReservedUsage: vi.fn() }));

import { getSchedule } from "./schedule-service";

describe("roadmap L2 schedule tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessSession.mockResolvedValue(true);
    mocks.session.mockResolvedValue({
      id: "session-a",
      sessionId: "device-a",
      userId: "tenant-a",
      user: { id: "tenant-a", role: "USER", ownerId: null },
    });
    mocks.schedule.mockResolvedValue(null);
  });

  it("[L2-15][L2-20] resolves the actor-owned device before reading a schedule", async () => {
    await expect(getSchedule({ id: "user-a", role: "USER" }, "device-a", "schedule-b"))
      .rejects.toMatchObject({ code: "SCHEDULE_NOT_FOUND", status: 404 });
    expect(mocks.canAccessSession).toHaveBeenCalledWith("user-a", "USER", "device-a");
    expect(mocks.schedule).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "schedule-b", sessionId: "session-a" },
    }));
  });
});
