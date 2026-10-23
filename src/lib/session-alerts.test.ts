import { beforeEach, describe, expect, it, vi } from "vitest";

// Fase 0 #3: a session that logs itself out must tell the tenant, not only the log.
const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  createNotification: vi.fn(),
  emit: vi.fn(),
  to: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: mocks.findSession },
    notification: { create: mocks.createNotification },
  },
}));

vi.mock("@/lib/socket-server", () => ({
  getSocketServer: () => ({ to: mocks.to }),
}));

import { notifySessionOwner } from "./session-alerts";

describe("session alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSession.mockResolvedValue({ name: "Nomor Utama" });
    mocks.createNotification.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "notif-1",
      createdAt: new Date("2026-10-23T00:00:00Z"),
      ...data,
    }));
    mocks.to.mockReturnValue({ emit: mocks.emit });
  });

  it("stores a WARNING notification and pushes it to the owner room", async () => {
    const result = await notifySessionOwner({ userId: "user-1", sessionId: "qa-session", kind: "LOGGED_OUT" });

    expect(result).not.toBeNull();
    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        title: "Sesi WhatsApp terputus",
        type: "WARNING",
        href: "/dashboard/sessions",
        message: expect.stringContaining("Nomor Utama"),
      }),
    });
    expect(mocks.to).toHaveBeenCalledWith("user:user-1");
    expect(mocks.emit).toHaveBeenCalledWith("notification:new", expect.objectContaining({
      id: "notif-1",
      userId: "user-1",
      title: "Sesi WhatsApp terputus",
      type: "WARNING",
    }));
  });

  it("falls back to the session id when the session has no name", async () => {
    mocks.findSession.mockResolvedValue({ name: "  " });

    await notifySessionOwner({ userId: "user-1", sessionId: "qa-session", kind: "STOPPED" });

    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({ message: expect.stringContaining("qa-session") }),
    });
  });

  it("does not throw when the alert cannot be stored", async () => {
    mocks.createNotification.mockRejectedValue(new Error("db down"));

    await expect(notifySessionOwner({ userId: "user-1", sessionId: "qa-session", kind: "RECONNECT_FAILED" }))
      .resolves.toBeNull();
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});
