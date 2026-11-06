import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    paymentAccount: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    getAuthenticatedUser: vi.fn(),
    isAdmin: vi.fn(),
    recordAudit: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
    getPaymentMethodsSnapshot: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isAdmin: mocks.isAdmin,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/payment-methods", () => ({
  getPaymentMethodsSnapshot: mocks.getPaymentMethodsSnapshot,
  evaluatePaymentMethods: vi.fn(),
  serializePaymentMethodsForPublic: vi.fn(),
}));

import { GET, POST } from "./route";

const admin = { id: "admin-1", email: "admin@example.com", role: "SUPERADMIN" };

function adminRequest(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  return new NextRequest(url, init);
}

describe("GET /api/admin/payment-accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(admin);
  });

  it("menolak user non-admin", async () => {
    mocks.isAdmin.mockReturnValue(false);
    const response = await GET(adminRequest("http://localhost/api/admin/payment-accounts"));
    expect(response.status).toBe(403);
  });

  it("mengembalikan daftar rekening + readiness + daftar bank", async () => {
    mocks.prisma.paymentAccount.findMany.mockResolvedValue([
      { id: "pa-1", bankName: "BCA", accountNumber: "1234567890", accountHolder: "DUMMY", isActive: true, isDefault: true, sortOrder: 0, createdAt: new Date(), _count: { paymentVerifications: 2 } },
    ]);
    mocks.getPaymentMethodsSnapshot.mockResolvedValue({
      manual: { key: "MANUAL", label: "Transfer Bank Manual", enabled: true, ready: true, missing: [] },
      midtrans: { key: "MIDTRANS", label: "Midtrans (Snap)", enabled: false, ready: false, missing: [] },
      anyReady: true,
      activeManualAccountCount: 1,
    });

    const response = await GET(adminRequest("http://localhost/api/admin/payment-accounts"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.accounts[0]).toMatchObject({ bankName: "BCA", usedCount: 2 });
    expect(body.data.methods.manual.ready).toBe(true);
    expect(Array.isArray(body.data.bankOptions)).toBe(true);
    expect(body.data.bankOptions).toContain("BCA");
  });
});

describe("POST /api/admin/payment-accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockReturnValue(true);
    mocks.getAuthenticatedUser.mockResolvedValue(admin);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(mocks.prisma),
    );
    mocks.prisma.paymentAccount.findFirst.mockResolvedValue(null);
    mocks.prisma.paymentAccount.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "pa-new",
      ...data,
    }));
    mocks.prisma.paymentAccount.updateMany.mockResolvedValue({ count: 1 });
  });

  it("menyimpan nomor rekening rapat (tanpa spasi/dash)", async () => {
    const request = adminRequest("http://localhost/api/admin/payment-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankName: "BCA", accountNumber: "1234 5678-90", accountHolder: "Dummy Holder" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mocks.prisma.paymentAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountNumber: "1234567890" }) }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_account.create", meta: expect.objectContaining({ accountLast4: "7890" }) }),
    );
  });

  it("menolak nomor rekening yang tidak valid", async () => {
    const request = adminRequest("http://localhost/api/admin/payment-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankName: "BCA", accountNumber: "12", accountHolder: "Dummy Holder" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("6-20 angka");
  });

  it("menolak bank di luar daftar", async () => {
    const request = adminRequest("http://localhost/api/admin/payment-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankName: "Bank Ngawur", accountNumber: "1234567890", accountHolder: "Dummy Holder" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("BANK_UNKNOWN");
  });

  it("rekening default menggantikan default lama dan selalu aktif", async () => {
    const request = adminRequest("http://localhost/api/admin/payment-accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankName: "Mandiri", accountNumber: "1234567890", accountHolder: "Dummy Holder", isDefault: true }),
    });
    await POST(request);
    expect(mocks.prisma.paymentAccount.updateMany).toHaveBeenCalledWith({ data: { isDefault: false } });
    expect(mocks.prisma.paymentAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true, isActive: true }) }),
    );
  });
});
