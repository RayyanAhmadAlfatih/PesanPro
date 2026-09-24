import { describe, expect, it, vi } from "vitest";
import { reviewPaymentVerificationInTransaction } from "./payment-verification-service";

const reviewedAt = new Date("2026-09-23T10:00:00.000Z");

function client() {
  const verification = {
    id: "payment-1",
    userId: "user-1",
    planId: "plan-pro",
    amount: { toString: () => "100000" },
    status: "APPROVED",
    plan: {
      id: "plan-pro",
      isActive: true,
      entitlements: [{ feature: "DEVICES", limitValue: BigInt(3) }],
    },
    user: { role: "USER" },
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
  };
}

describe("manual payment verification", () => {
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
  });

  it("rejects a review that conflicts with the final status", async () => {
    const tx = client();
    tx.paymentVerification.updateMany.mockResolvedValue({ count: 0 });
    tx.paymentVerification.findUnique.mockResolvedValue({
      id: "payment-1",
      userId: "user-1",
      status: "REJECTED",
      plan: { id: "plan-pro", isActive: true, entitlements: [] },
      user: { role: "USER" },
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
