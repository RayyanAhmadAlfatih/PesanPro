import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = {
    campaign: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    broadcastLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    scheduledMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    autoReply: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    messageJob: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    privateMedia: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    tenantEntitlementOverride: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    authState: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { delete: vi.fn().mockResolvedValue({ id: "tenant-1" }) },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: {
      findMany: vi.fn(),
    },
    messageJob: {
      findFirst: vi.fn(),
    },
    privateMedia: {
      findFirst: vi.fn(),
    },
    tenantEntitlementOverride: {
      findFirst: vi.fn(),
    },
    promo: {
      findFirst: vi.fn(),
    },
    planPriceHistory: {
      findFirst: vi.fn(),
    },
    authState: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    tx,
    prisma,
    getAuthenticatedUser: vi.fn(),
    isAdmin: vi.fn(),
    recordAudit: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
    stopSession: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isAdmin: mocks.isAdmin,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/modules/whatsapp/manager", () => ({
  waManager: { stopSession: mocks.stopSession },
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
}));

import { DELETE, PATCH } from "./route";

const superAdmin = { id: "admin-1", email: "admin@example.com", role: "SUPERADMIN" };

function request(init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new NextRequest("http://localhost/api/users/tenant-1", init);
}

describe("DELETE /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(superAdmin);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation(async (callbackOrArray: unknown) => {
      if (typeof callbackOrArray === "function") {
        return (callbackOrArray as (tx: unknown) => Promise<unknown>)(mocks.tx);
      }
      return Promise.all(callbackOrArray as Promise<unknown>[]);
    });
    mocks.prisma.session.findMany.mockResolvedValue([
      { id: "s-1", sessionId: "wa-session-1" },
    ]);
    mocks.prisma.messageJob.findFirst.mockResolvedValue(null);
    mocks.prisma.privateMedia.findFirst.mockResolvedValue(null);
    mocks.prisma.tenantEntitlementOverride.findFirst.mockResolvedValue(null);
    mocks.prisma.promo.findFirst.mockResolvedValue(null);
    mocks.prisma.planPriceHistory.findFirst.mockResolvedValue(null);
  });

  it("menolak penghapusan oleh user non-superadmin (403)", async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe("Unauthorized");
  });

  it("menolak jika superadmin menghapus dirinya sendiri (400)", async () => {
    const res = await DELETE(request(), { params: Promise.resolve({ id: "admin-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Cannot delete yourself");
    expect(body.error).toBe("Cannot delete yourself");
  });

  it("mengembalikan 404 jika user tidak ditemukan", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await DELETE(request(), { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("User not found");
  });

  it("menolak jika user pernah menjadi requester pesan milik tenant lain (409)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.messageJob.findFirst.mockResolvedValue({ id: "job-other-tenant" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("user is the requester of message jobs belonging to another tenant");
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("menolak jika user pernah mengupload media milik tenant lain (409)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.privateMedia.findFirst.mockResolvedValue({ id: "media-other-tenant" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("user uploaded media belonging to another tenant");
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("menolak jika user pernah membuat entitlement override untuk tenant lain (409)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.tenantEntitlementOverride.findFirst.mockResolvedValue({ id: "override-other" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("user created entitlement overrides for another tenant");
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("menolak jika user membuat promo atau plan price history (409)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.promo.findFirst.mockResolvedValue({ id: "promo-1" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("user created promotional codes");
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("menolak jika user tercatat mengubah riwayat harga paket (409)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.planPriceHistory.findFirst.mockResolvedValue({ id: "pph-1" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("user has recorded plan price history");
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("berhasil menghapus user yang pernah kirim pesan / memiliki riwayat pesan (200, user terhapus)", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(true);
    expect(body.message).toBe("User deleted successfully");

    // Verifikasi relasi restrict dibersihkan di dalam transaksi sebelum user dihapus
    expect(mocks.stopSession).toHaveBeenCalledWith("wa-session-1");
    expect(mocks.tx.campaign.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" } });
    expect(mocks.tx.broadcastLog.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ tenantId: "tenant-1" }, { sessionDbId: { in: ["s-1"] } }],
      },
    });
    expect(mocks.tx.scheduledMessage.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ["s-1"] } },
    });
    expect(mocks.tx.autoReply.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ["s-1"] } },
    });
    expect(mocks.tx.messageJob.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: "tenant-1" }, { requestedById: "tenant-1" }] },
    });
    expect(mocks.tx.privateMedia.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: "tenant-1" }, { uploaderId: "tenant-1" }] },
    });
    expect(mocks.tx.tenantEntitlementOverride.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ tenantId: "tenant-1" }, { createdById: "tenant-1" }] },
    });
    expect(mocks.tx.authState.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ["wa-session-1"] } },
    });
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.user_delete", resourceId: "tenant-1" })
    );
  });

  it("tetap berhasil (200) jika recordAudit gagal sesudah user terhapus", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.recordAudit.mockRejectedValue(new Error("Audit log database blip"));

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(true);
    expect(body.message).toBe("User deleted successfully");
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
    consoleSpy.mockRestore();
  });

  it("menjalankan transaksi penghapusan dengan opsi timeout minimal 30000 ms", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });

    const res = await DELETE(request(), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(200);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const callArgs = mocks.prisma.$transaction.mock.calls[0];
    const options = callArgs[1] as { timeout?: number } | undefined;
    expect(options).toBeDefined();
    expect(typeof options?.timeout).toBe("number");
    expect(options!.timeout).toBeGreaterThanOrEqual(30000);
  });
});

describe("PATCH /api/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(superAdmin);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.prisma.session.findMany.mockResolvedValue([
      { id: "s-1", sessionId: "wa-session-1" },
    ]);
  });

  it("menolak update oleh non-superadmin (403)", async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    }), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(403);
  });

  it("menolak data update tidak valid atau kosong (400)", async () => {
    const res = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: "tenant-1" }) });
    expect(res.status).toBe(400);
  });

  it("menolak jika superadmin mencopot akses superadmin sendiri (400)", async () => {
    const res = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "USER" }),
    }), { params: Promise.resolve({ id: "admin-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Cannot remove your own superadmin access");
  });

  it("mengembalikan 404 jika user yang diupdate tidak ditemukan", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    }), { params: Promise.resolve({ id: "tenant-404" }) });
    expect(res.status).toBe(404);
  });

  it("berhasil mengupdate data user dan menghentikan session jika status SUSPENDED", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.user.update.mockResolvedValue({
      id: "tenant-1",
      name: "Updated Name",
      email: "tenant1@example.com",
      role: "USER",
      status: "SUSPENDED",
      deviceLimit: 1,
      updatedAt: new Date(),
    });

    const res = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated Name", status: "SUSPENDED" }),
    }), { params: Promise.resolve({ id: "tenant-1" }) });

    expect(res.status).toBe(200);
    expect(mocks.stopSession).toHaveBeenCalledWith("wa-session-1");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.user_update", resourceId: "tenant-1" })
    );
  });
});
