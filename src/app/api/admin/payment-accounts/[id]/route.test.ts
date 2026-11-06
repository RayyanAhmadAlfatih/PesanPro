import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    paymentAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    getAuthenticatedUser: vi.fn(),
    isAdmin: vi.fn(),
    recordAudit: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isAdmin: mocks.isAdmin,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: mocks.getClientIp }));

import { DELETE, PATCH } from "./route";

const admin = { id: "admin-1", email: "admin@example.com", role: "SUPERADMIN" };

function request(init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new NextRequest("http://localhost/api/admin/payment-accounts/pa-1", init);
}

describe("PATCH /api/admin/payment-accounts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(admin);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.prisma));
  });

  it("menolak user non-admin", async () => {
    mocks.isAdmin.mockReturnValue(false);
    const response = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    }), { params: Promise.resolve({ id: "pa-1" }) });
    expect(response.status).toBe(403);
  });

  it("menonaktifkan rekening default dan memindahkan default ke rekening aktif pertama", async () => {
    mocks.prisma.paymentAccount.findUnique.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", isActive: true, isDefault: true,
    });
    mocks.prisma.paymentAccount.update.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", isActive: false, isDefault: false,
    });
    mocks.prisma.paymentAccount.findFirst.mockResolvedValue({ id: "pa-2", bankName: "Mandiri", accountNumber: "9876543210", accountHolder: "D" });

    const response = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    }), { params: Promise.resolve({ id: "pa-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.prisma.paymentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pa-1" }, data: expect.objectContaining({ isActive: false, isDefault: false }) }),
    );
    // Default dipindah ke rekening aktif pertama, bukan dibiarkan kosong.
    expect(mocks.prisma.paymentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pa-2" }, data: { isDefault: true } }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_account.deactivate" }),
    );
  });

  it("audit hanya mencatat 4 digit terakhir nomor rekening", async () => {
    mocks.prisma.paymentAccount.findUnique.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", isActive: true, isDefault: false,
    });
    mocks.prisma.paymentAccount.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", isActive: true, isDefault: false, ...data,
    }));

    await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountHolder: "Nama Baru" }),
    }), { params: Promise.resolve({ id: "pa-1" }) });

    const auditMeta = mocks.recordAudit.mock.calls[0][0].meta as Record<string, unknown>;
    expect(auditMeta.accountLast4).toBe("7890");
    expect(JSON.stringify(auditMeta)).not.toContain("1234567890");
  });

  it("menolak nomor rekening tidak valid saat edit", async () => {
    mocks.prisma.paymentAccount.findUnique.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", isActive: true, isDefault: false,
    });
    const response = await PATCH(request({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountNumber: "abc" }),
    }), { params: Promise.resolve({ id: "pa-1" }) });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/admin/payment-accounts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(admin);
  });

  it("menolak menghapus rekening yang pernah dipakai pembayaran (409)", async () => {
    mocks.prisma.paymentAccount.findUnique.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", _count: { paymentVerifications: 3 },
    });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "pa-1" }) });
    expect(response.status).toBe(409);
    expect(mocks.prisma.paymentAccount.delete).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.error).toContain("Nonaktifkan");
  });

  it("menghapus rekening yang belum pernah dipakai", async () => {
    mocks.prisma.paymentAccount.findUnique.mockResolvedValue({
      id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "D", _count: { paymentVerifications: 0 },
    });
    mocks.prisma.paymentAccount.delete.mockResolvedValue({ id: "pa-1" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "pa-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.prisma.paymentAccount.delete).toHaveBeenCalledWith({ where: { id: "pa-1" } });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_account.delete" }),
    );
  });
});
