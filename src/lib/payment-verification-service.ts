import { PaymentVerificationStatus, type Prisma } from "@prisma/client";

type ReviewStatus = Exclude<PaymentVerificationStatus, "PENDING">;

export class PaymentVerificationReviewError extends Error {
  constructor(
    public readonly code: "PAYMENT_NOT_PENDING" | "PAYMENT_PLAN_UNAVAILABLE" | "PAYMENT_USER_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "PaymentVerificationReviewError";
  }
}

export function addOneBillingMonth(startsAt: Date) {
  const result = new Date(startsAt);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export async function reviewPaymentVerificationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    verificationId: string;
    status: ReviewStatus;
    reviewNote: string;
    reviewerEmail: string;
    reviewedAt: Date;
  },
) {
  const claimed = await tx.paymentVerification.updateMany({
    where: { id: input.verificationId, status: "PENDING" },
    data: {
      status: input.status,
      reviewNote: input.reviewNote,
      reviewerEmail: input.reviewerEmail,
      reviewedAt: input.reviewedAt,
    },
  });
  if (claimed.count !== 1) {
    const existing = await tx.paymentVerification.findUnique({
      where: { id: input.verificationId },
      include: {
        user: { select: { role: true } },
        plan: { include: { entitlements: { where: { feature: "DEVICES" } } } },
      },
    });
    if (!existing || existing.status !== input.status) {
      throw new PaymentVerificationReviewError("PAYMENT_NOT_PENDING", "Payment verification has already been reviewed");
    }
    const subscription = input.status === "APPROVED"
      ? await tx.subscription.findUnique({ where: { userId: existing.userId } })
      : null;
    return { verification: existing, subscription, idempotent: true };
  }

  const verification = await tx.paymentVerification.findUnique({
    where: { id: input.verificationId },
    include: {
      user: { select: { role: true } },
      plan: { include: { entitlements: { where: { feature: "DEVICES" } } } },
    },
  });
  if (!verification) {
    throw new PaymentVerificationReviewError("PAYMENT_NOT_PENDING", "Payment verification not found after review");
  }
  if (input.status !== "APPROVED") return { verification, subscription: null, idempotent: false };
  if (verification.user.role !== "USER") {
    throw new PaymentVerificationReviewError("PAYMENT_USER_INVALID", "Payment owner is not an active customer account");
  }
  if (!verification.plan || !verification.plan.isActive) {
    throw new PaymentVerificationReviewError("PAYMENT_PLAN_UNAVAILABLE", "The selected plan is no longer active");
  }

  const endsAt = addOneBillingMonth(input.reviewedAt);
  const subscription = await tx.subscription.upsert({
    where: { userId: verification.userId },
    update: {
      planId: verification.plan.id,
      status: "ACTIVE",
      startsAt: input.reviewedAt,
      trialEndsAt: null,
      endsAt,
      graceEndsAt: null,
    },
    create: {
      userId: verification.userId,
      planId: verification.plan.id,
      status: "ACTIVE",
      startsAt: input.reviewedAt,
      trialEndsAt: null,
      endsAt,
      graceEndsAt: null,
    },
  });
  await tx.subscriptionHistory.create({
    data: {
      userId: verification.userId,
      planId: verification.plan.id,
      status: "ACTIVE",
      reason: `payment_verification:${verification.id}`,
      startsAt: input.reviewedAt,
      endsAt,
      graceEndsAt: null,
    },
  });

  const deviceLimit = verification.plan.entitlements[0]?.limitValue;
  if (deviceLimit !== undefined && deviceLimit !== null) {
    await tx.user.update({
      where: { id: verification.userId },
      data: { deviceLimit: Number(deviceLimit) },
    });
  }
  return { verification, subscription, idempotent: false };
}
