import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    session: { findFirst: vi.fn(), findMany: vi.fn() },
    sessionAccess: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./auth", () => ({ auth: vi.fn() }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { canAccessSession } from "./api-auth";

describe("tenant session isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes user access to devices they own", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "USER", status: "ACTIVE", ownerId: null });
    mocks.prisma.session.findFirst.mockResolvedValue({ id: "device-a" });

    await expect(canAccessSession("user-a", "USER", "device-a")).resolves.toBe(true);
    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-a" }),
    }));
  });

  it("does not allow a user to access another user's device", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "USER", status: "ACTIVE", ownerId: null });
    mocks.prisma.session.findFirst.mockResolvedValue(null);

    await expect(canAccessSession("user-b", "USER", "device-b")).resolves.toBe(false);
    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-b",
      }),
    }));
  });

  it("denies suspended users before querying device access", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "USER", status: "SUSPENDED", ownerId: null });
    await expect(canAccessSession("user-a", "USER", "device-a")).resolves.toBe(false);
    expect(mocks.prisma.session.findFirst).not.toHaveBeenCalled();
  });
});
