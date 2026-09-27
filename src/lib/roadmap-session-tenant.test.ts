import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  session: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    session: { findFirst: mocks.session, findMany: vi.fn() },
    sessionAccess: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("./auth", () => ({ auth: vi.fn() }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { canAccessSession } from "./api-auth";

describe("roadmap L2 session/chat tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ role: "USER", status: "ACTIVE", ownerId: null });
  });

  it("[L2-08][L2-09][L2-20] rejects a guessed session/chat device outside the actor tenant", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(canAccessSession("user-a", "USER", "device-b")).resolves.toBe(false);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-a",
        OR: [{ id: "device-b" }, { sessionId: "device-b" }],
      }),
    }));
  });
});
