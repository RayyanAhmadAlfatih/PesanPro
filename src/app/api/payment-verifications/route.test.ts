import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Fokus tes: pengiriman bukti pembayaran (termasuk perpanjangan paket yang
 * sama) mengantre email admin dan email konfirmasi ke user di transaksi yang
 * sama, dan tidak mengantre apa pun kalau permintaannya ditolak lebih dulu.
 */
const mocks = vi.hoisted(() => {
  const prisma = {
    paymentVerification: { findFirst: vi.fn(), findMany: vi.fn() },
    paymentAccount: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    plan: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    prisma,
    auth: vi.fn(),
    recordAudit: vi.fn(),
    checkPersistentRateLimit: vi.fn(),
    getClientIp: vi.fn(() => "127.0.0.1"),
    rateLimitHeaders: vi.fn(() => ({})),
    parsePaymentProofUpload: vi.fn(),
    storePaymentProof: vi.fn(),
    deleteStoredPaymentProof: vi.fn(),
    queuePaymentSubmittedEmails: vi.fn(),
    queuePaymentSubmittedUserEmail: vi.fn(),
    getPaymentMethodsSnapshot: vi.fn(),
    quotePurchase: vi.fn(),
    assertRedemptionWithinLimits: vi.fn(),
    loggerWarn: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.checkPersistentRateLimit,
  getClientIp: mocks.getClientIp,
  rateLimitHeaders: mocks.rateLimitHeaders,
}));
vi.mock("@/lib/payment-proof", () => ({
  parsePaymentProofUpload: mocks.parsePaymentProofUpload,
  storePaymentProof: mocks.storePaymentProof,
  deleteStoredPaymentProof: mocks.deleteStoredPaymentProof,
}));
vi.mock("@/lib/email-notifications", () => ({
  queuePaymentSubmittedEmails: mocks.queuePaymentSubmittedEmails,
  queuePaymentSubmittedUserEmail: mocks.queuePaymentSubmittedUserEmail,
}));
vi.mock("@/lib/payment-methods", () => ({
  getPaymentMethodsSnapshot: mocks.getPaymentMethodsSnapshot,
}));
// Promo error class harus asli supaya `instanceof` di route tetap bekerja.
vi.mock("@/lib/promo-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/promo-service")>("@/lib/promo-service");
  return {
    ...actual,
    quotePurchase: mocks.quotePurchase,
    assertRedemptionWithinLimits: mocks.assertRedemptionWithinLimits,
  };
});
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn(), success: vi.fn(), banner: vi.fn() },
}));

import { POST } from "./route";

const PLAN = {
  id: "plan-pro",
  name: "Pro",
  currency: "IDR",
  priceMonthly: { toString: () => "100000" },
  priceYearly: { toString: () => "1000000" },
};

function proofRequest() {
  return new NextRequest("http://localhost/api/payment-verifications", { method: "POST" });
}

describe("POST /api/payment-verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", email: "raka@example.com", role: "USER", accountActive: true },
    });
    mocks.checkPersistentRateLimit.mockResolvedValue({ success: true });
    mocks.prisma.paymentVerification.findFirst.mockResolvedValue(null);
    mocks.parsePaymentProofUpload.mockResolvedValue({
      planId: PLAN.id,
      reference: "BANK-002",
      billingCycle: "YEARLY",
      bankAccountId: "bank-1",
      whatsappNumber: "",
      voucherCode: "",
      declaredMimeType: "image/png",
      buffer: Buffer.from("proof"),
    });
    mocks.getPaymentMethodsSnapshot.mockResolvedValue({
      manual: { enabled: true, ready: true },
      midtrans: { enabled: false, ready: false },
      anyReady: true,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ whatsappNumber: "6281234567890" });
    mocks.prisma.paymentAccount.findFirst.mockResolvedValue({ id: "bank-1" });
    mocks.prisma.plan.findFirst.mockResolvedValue(PLAN);
    mocks.storePaymentProof.mockResolvedValue({
      storagePath: "private/payment-proofs/proof.png",
      mimeType: "image/png",
      sizeBytes: 5,
      checksumSha256: "abc",
    });
    mocks.deleteStoredPaymentProof.mockResolvedValue(undefined);
    mocks.quotePurchase.mockResolvedValue({
      plan: { id: PLAN.id, code: "PRO", name: "Pro", currency: "IDR" },
      cycle: "YEARLY",
      listMonthlyPrice: "100000",
      listYearlyPrice: "1000000",
      baseAmount: "1000000",
      discountAmount: "0",
      amount: "1000000",
      firstPurchase: false,
      promo: null,
    });
    mocks.queuePaymentSubmittedEmails.mockResolvedValue(1);
    mocks.queuePaymentSubmittedUserEmail.mockResolvedValue(1);
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      user: { update: vi.fn() },
      promoRedemption: { create: vi.fn() },
      paymentVerification: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          status: "PENDING",
          createdAt: new Date("2026-11-26T02:00:00.000Z"),
        })),
      },
    }));
  });

  it("mengantre email admin dan email konfirmasi user untuk perpanjangan tahunan", async () => {
    const response = await POST(proofRequest());
    expect(response.status).toBe(201);
    expect(mocks.queuePaymentSubmittedEmails).toHaveBeenCalledTimes(1);
    expect(mocks.queuePaymentSubmittedUserEmail).toHaveBeenCalledTimes(1);

    const [, args] = mocks.queuePaymentSubmittedUserEmail.mock.calls[0];
    expect(args).toMatchObject({
      userId: "user-1",
      planName: "Pro",
      amount: "1000000",
      currency: "IDR",
      reference: "BANK-002",
    });
  });

  it("tidak mengantre email apa pun saat masih ada bukti yang menunggu", async () => {
    mocks.prisma.paymentVerification.findFirst.mockResolvedValue({ id: "pending-1" });
    const response = await POST(proofRequest());
    expect(response.status).toBe(409);
    expect(mocks.queuePaymentSubmittedEmails).not.toHaveBeenCalled();
    expect(mocks.queuePaymentSubmittedUserEmail).not.toHaveBeenCalled();
  });

  it("tidak mengantre email apa pun saat transfer manual dimatikan", async () => {
    mocks.getPaymentMethodsSnapshot.mockResolvedValue({
      manual: { enabled: false, ready: false },
      midtrans: { enabled: false, ready: false },
      anyReady: false,
    });
    const response = await POST(proofRequest());
    expect(response.status).toBe(503);
    expect(mocks.queuePaymentSubmittedUserEmail).not.toHaveBeenCalled();
  });
});
