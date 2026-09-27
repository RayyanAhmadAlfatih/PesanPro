import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reviewPaymentVerificationInTransaction } from "./payment-verification-service";
import { _resetEnvCache } from "./env";

const reviewedAt = new Date("2026-09-23T10:00:00.000Z");

function client() {
  const verification = {
    id: "payment-1",
    userId: "user-1",
    planId: "plan-pro",
    amount: { toString: () => "100000" },
    currency: "IDR",
    reference: "BANK-001",
    status: "APPROVED",
    plan: {
      id: "plan-pro",
      name: "Pro",
      isActive: true,
      entitlements: [{ feature: "DEVICES", limitValue: BigInt(3) }],
    },
    user: { role: "USER", name: "Customer", email: "customer@example.com" },
  };
  return {
    paymentVerification: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(verification),
    },
    subscription: {
      upsert: vi.fn().mockResolvedValue({ id: "subscription-1", userId: "user-1", planId: "plan-pro", status: "ACTIVE" }),
      findUnique: vi.fn().mockResolvedValue({ id: "subscription-1", userId: "user-1", planId: "plan-pro", status: "ACTIVE" }),
    },
    subscriptionHistory: { create: vi.fn().mockResolvedValue({ id: "history-1" }) },
    user: { update: vi.fn().mockResolvedValue({ id: "user-1" }) },
    emailOutbox: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe("manual payment verification", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "https://pesanpro.example.com");
    _resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
  });

  it("atomically activates the paid plan when a proof is approved", async () => {
    const tx = client();
    const result = await reviewPaymentVerificationInTransaction(tx as never, {
      verificationId: "payment-1",
      status: "APPROVED",
      reviewNote: "Transfer verified",
      reviewerEmail: "admin@example.com",
      reviewedAt,
    });

    expect(tx.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1" },
      update: expect.objectContaining({ planId: "plan-pro", status: "ACTIVE", trialEndsAt: null }),
      create: expect.objectContaining({ userId: "user-1", planId: "plan-pro", status: "ACTIVE", trialEndsAt: null }),
    }));
    expect(tx.subscriptionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        planId: "plan-pro",
        status: "ACTIVE",
        reason: "payment_verification:payment-1",
      }),
    });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { deviceLimit: 3 } });
    expect(tx.emailOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        eventKey: "payment-approved:payment-1:user-1",
        type: "PAYMENT_APPROVED",
        toEmail: "customer@example.com",
      })],
      skipDuplicates: true,
    }));
    expect(result.subscription).toMatchObject({ planId: "plan-pro", status: "ACTIVE" });
  });

  it("does not change a subscription when a proof is rejected", async () => {
    const tx = client();
    await reviewPaymentVerificationInTransaction(tx as never, {
      verificationId: "payment-1",
      status: "REJECTED",
      reviewNote: "Reference not found",
      reviewerEmail: "admin@example.com",
      reviewedAt,
    });
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.subscriptionHistory.create).not.toHaveBeenCalled();
    expect(tx.emailOutbox.createMany).not.toHaveBeenCalled();
  });

  it("treats a repeated approval as an idempotent success", async () => {
    const tx = client();
    tx.paymentVerification.updateMany.mockResolvedValue({ count: 0 });
    const result = await reviewPaymentVerificationInTransaction(tx as never, {
      verificationId: "payment-1",
      status: "APPROVED",
      reviewNote: "Transfer verified",
      reviewerEmail: "admin@example.com",
      reviewedAt,
    });
    expect(result.idempotent).toBe(true);
    expect(result.subscription).toMatchObject({ status: "ACTIVE" });
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
    expect(tx.subscriptionHistory.create).not.toHaveBeenCalled();
    expect(tx.emailOutbox.createMany).not.toHaveBeenCalled();
  });

  it("rejects a review that conflicts with the final status", async () => {
    const tx = client();
    tx.paymentVerification.updateMany.mockResolvedValue({ count: 0 });
    tx.paymentVerification.findUnique.mockResolvedValue({
      id: "payment-1",
      userId: "user-1",
      status: "REJECTED",
      plan: { id: "plan-pro", name: "Pro", isActive: true, entitlements: [] },
      user: { role: "USER", name: "Customer", email: "customer@example.com" },
    });
    await expect(reviewPaymentVerificationInTransaction(tx as never, {
      verificationId: "payment-1",
      status: "APPROVED",
      reviewNote: "Transfer verified",
      reviewerEmail: "admin@example.com",
      reviewedAt,
    })).rejects.toMatchObject({ code: "PAYMENT_NOT_PENDING" });
  });
});
