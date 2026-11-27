import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Fokus tes ini: route pendaftaran mengantre dua email di transaksi yang sama,
 * yaitu notifikasi admin dan konfirmasi "bukti sudah diterima" ke user. Semua
 * bagian lambat (bcrypt, storage bukti, rate limit persisten) dimock supaya
 * yang diuji adalah pemanggilannya, bukan kecepatan hashing.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    systemConfig: { findUnique: vi.fn() },
    paymentAccount: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    plan: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    checkPersistentRateLimit: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
    rateLimitHeaders: vi.fn(() => ({})),
    recordAudit: vi.fn(),
    provisionDefaultSubscriptionInTransaction: vi.fn(),
    queuePaymentSubmittedEmails: vi.fn(),
    queuePaymentSubmittedUserEmail: vi.fn(),
    storePaymentProof: vi.fn(),
    deleteStoredPaymentProof: vi.fn(),
    parseRegistrationUpload: vi.fn(),
    getPaymentMethodsSnapshot: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.checkPersistentRateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitHeaders: mocks.rateLimitHeaders,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/billing", () => ({
  provisionDefaultSubscriptionInTransaction: mocks.provisionDefaultSubscriptionInTransaction,
}));
vi.mock("@/lib/email-notifications", () => ({
  queuePaymentSubmittedEmails: mocks.queuePaymentSubmittedEmails,
  queuePaymentSubmittedUserEmail: mocks.queuePaymentSubmittedUserEmail,
}));
vi.mock("@/lib/payment-proof", () => ({
  storePaymentProof: mocks.storePaymentProof,
  deleteStoredPaymentProof: mocks.deleteStoredPaymentProof,
}));
vi.mock("@/lib/registration-upload", () => ({
  parseRegistrationUpload: mocks.parseRegistrationUpload,
}));
vi.mock("@/lib/payment-methods", () => ({
  getPaymentMethodsSnapshot: mocks.getPaymentMethodsSnapshot,
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed-password") } }));

import { POST } from "./route";

const PLAN = {
  id: "plan-pro",
  name: "Pro",
  currency: "IDR",
  priceMonthly: { toString: () => "100000" },
  priceYearly: { toString: () => "1000000" },
};

function registerRequest() {
  return new NextRequest("http://localhost/api/auth/register", { method: "POST" });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPersistentRateLimit.mockResolvedValue({ success: true });
    mocks.parseRegistrationUpload.mockResolvedValue({
      fields: {
        name: "Raka Pratama",
        email: "raka@example.com",
        whatsappNumber: "081234567890",
        password: "Rahasia12345",
        planId: PLAN.id,
        reference: "BANK-001",
        billingCycle: "MONTHLY",
        bankAccountId: "bank-1",
      },
      declaredMimeType: "image/png",
      buffer: Buffer.from("proof"),
    });
    mocks.getPaymentMethodsSnapshot.mockResolvedValue({
      manual: { enabled: true, ready: true },
      midtrans: { enabled: false, ready: false },
      anyReady: true,
    });
    mocks.prisma.systemConfig.findUnique.mockResolvedValue({ enableRegistration: true, supportWhatsapp: "628111" });
    mocks.prisma.paymentAccount.findFirst.mockResolvedValue({
      id: "bank-1",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolder: "PT PesanPro",
    });
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.plan.findFirst.mockResolvedValue(PLAN);
    mocks.storePaymentProof.mockResolvedValue({
      storagePath: "private/payment-proofs/proof.png",
      mimeType: "image/png",
      sizeBytes: 5,
      checksumSha256: "abc",
    });
    mocks.deleteStoredPaymentProof.mockResolvedValue(undefined);
    mocks.queuePaymentSubmittedEmails.mockResolvedValue(2);
    mocks.queuePaymentSubmittedUserEmail.mockResolvedValue(1);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      user: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: data.id,
          name: data.name,
          email: data.email,
        })),
      },
      paymentVerification: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          status: "PENDING",
          createdAt: new Date("2026-11-26T02:00:00.000Z"),
        })),
      },
    }));
  });

  it("mengantre email admin dan email konfirmasi ke user setelah bukti tersimpan", async () => {
    const response = await POST(registerRequest());
    expect(response.status).toBe(200);
    expect(mocks.queuePaymentSubmittedEmails).toHaveBeenCalledTimes(1);
    expect(mocks.queuePaymentSubmittedUserEmail).toHaveBeenCalledTimes(1);

    const verificationArgs = mocks.queuePaymentSubmittedUserEmail.mock.calls[0][1];
    expect(verificationArgs).toMatchObject({
      planName: "Pro",
      amount: "100000",
      currency: "IDR",
      reference: "BANK-001",
    });
    expect(typeof verificationArgs.userId).toBe("string");
    expect(verificationArgs.verificationId).toBeTruthy();
  });

  it("membatalkan email user bila pendaftaran ditolak sebelum transaksi", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-lama" });
    const response = await POST(registerRequest());
    expect(response.status).toBe(400);
    expect(mocks.queuePaymentSubmittedEmails).not.toHaveBeenCalled();
    expect(mocks.queuePaymentSubmittedUserEmail).not.toHaveBeenCalled();
  });
});
