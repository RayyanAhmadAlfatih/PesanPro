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

import { canAccessSession, getAccessibleSessions, isSessionOwner } from "./api-auth";

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

  it("lets superadmins access a device they own", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "SUPERADMIN", status: "ACTIVE", ownerId: null });
    mocks.prisma.session.findFirst.mockResolvedValue({ id: "admin-device" });

    await expect(canAccessSession("admin-a", "SUPERADMIN", "admin-device")).resolves.toBe(true);
    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "admin-a" }),
    }));
  });

  it("does not grant superadmins access to customer devices", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "SUPERADMIN", status: "ACTIVE", ownerId: null });
    mocks.prisma.session.findFirst.mockResolvedValue(null);

    await expect(canAccessSession("admin-a", "SUPERADMIN", "customer-device")).resolves.toBe(false);
    expect(mocks.prisma.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "admin-a" }),
    }));
  });

  it("lists only sessions owned by the authenticated superadmin", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ role: "SUPERADMIN", status: "ACTIVE", ownerId: null });
    mocks.prisma.session.findMany.mockResolvedValue([{ id: "admin-device" }]);

    await expect(getAccessibleSessions("admin-a", "SUPERADMIN")).resolves.toEqual([{ id: "admin-device" }]);
    expect(mocks.prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "admin-a" },
    }));
  });

  it("requires actual ownership for superadmin device management", async () => {
    mocks.prisma.session.findFirst.mockResolvedValueOnce({ id: "admin-device" }).mockResolvedValueOnce(null);

    await expect(isSessionOwner("admin-a", "SUPERADMIN", "admin-device")).resolves.toBe(true);
    await expect(isSessionOwner("admin-a", "SUPERADMIN", "customer-device")).resolves.toBe(false);
    expect(mocks.prisma.session.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({ userId: "admin-a" })]) }),
    }));
  });
});
