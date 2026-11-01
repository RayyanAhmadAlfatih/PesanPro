import { PaymentVerificationStatus, type BillingCycle, type Prisma } from "@prisma/client";
import { deriveSubscriptionStatus, isSubscriptionUsable } from "./billing";
import { queuePaymentApprovedEmail } from "./email-notifications";

type ReviewStatus = Exclude<PaymentVerificationStatus, "PENDING">;

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  YEARLY: 12,
};

export class PaymentVerificationReviewError extends Error {
  constructor(
    public readonly code: "PAYMENT_NOT_PENDING" | "PAYMENT_PLAN_UNAVAILABLE" | "PAYMENT_USER_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "PaymentVerificationReviewError";
  }
}

export function addBillingMonths(startsAt: Date, months: number) {
  const result = new Date(startsAt);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addOneBillingMonth(startsAt: Date) {
  return addBillingMonths(startsAt, 1);
}

export function billingPeriodEnd(startsAt: Date, cycle: BillingCycle) {
  // Falls back to a month for an unrecognised value, so a row read before the
  // cycle column existed can never produce an invalid end date.
  return addBillingMonths(startsAt, BILLING_CYCLE_MONTHS[cycle] ?? BILLING_CYCLE_MONTHS.MONTHLY);
}

/**
 * Decide the paid window for an approved payment.
 *
 * A renewal of the same plan starts where the current paid window ends, so a
 * customer who pays a few days early keeps the days they already paid for.
 * A plan change or an expired subscription starts now. `startsAt` is kept for
 * a renewal because it anchors the monthly usage counter; moving it would
 * reset the quota in the middle of a period.
 */
export function resolveSubscriptionPeriod(input: {
  now: Date;
  newPlanId: string;
  cycle: BillingCycle;
  current: { planId: string; startsAt: Date; endsAt: Date | null } | null;
  currentUsable: boolean;
}) {
  const months = BILLING_CYCLE_MONTHS[input.cycle] ?? BILLING_CYCLE_MONTHS.MONTHLY;
  const samePlan = Boolean(
    input.current
    && input.currentUsable
    && input.current.planId === input.newPlanId,
  );
  if (samePlan && input.current?.endsAt && input.current.endsAt > input.now) {
    return {
      startsAt: input.current.startsAt,
      endsAt: addBillingMonths(input.current.endsAt, months),
      extendedExistingPeriod: true,
    };
  }
  return {
    startsAt: input.now,
    endsAt: addBillingMonths(input.now, months),
    extendedExistingPeriod: false,
  };
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
        user: { select: { role: true, name: true, email: true } },
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
      user: { select: { role: true, name: true, email: true } },
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

  // One approved payment buys one month or one year, whichever the customer
  // actually paid for. The cycle is read from the submission, never inferred
  // from the amount. A same-plan renewal extends the current paid window
  // instead of restarting it, so early renewals do not lose paid days.
  const currentSubscription = await tx.subscription.findUnique({
    where: { userId: verification.userId },
    select: { planId: true, status: true, startsAt: true, endsAt: true, trialEndsAt: true, graceEndsAt: true },
  });
  const currentStatus = currentSubscription ? deriveSubscriptionStatus(currentSubscription, input.reviewedAt) : null;
  const period = resolveSubscriptionPeriod({
    now: input.reviewedAt,
    newPlanId: verification.plan.id,
    cycle: verification.billingCycle,
    current: currentSubscription,
    currentUsable: currentStatus ? isSubscriptionUsable(currentStatus) : false,
  });
  const subscription = await tx.subscription.upsert({
    where: { userId: verification.userId },
    update: {
      planId: verification.plan.id,
      status: "ACTIVE",
      billingCycle: verification.billingCycle,
      startsAt: period.startsAt,
      trialEndsAt: null,
      endsAt: period.endsAt,
      graceEndsAt: null,
    },
    create: {
      userId: verification.userId,
      planId: verification.plan.id,
      status: "ACTIVE",
      billingCycle: verification.billingCycle,
      startsAt: period.startsAt,
      trialEndsAt: null,
      endsAt: period.endsAt,
      graceEndsAt: null,
    },
  });
  await tx.subscriptionHistory.create({
    data: {
      userId: verification.userId,
      planId: verification.plan.id,
      status: "ACTIVE",
      reason: `payment_verification:${verification.id}`,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
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
  await queuePaymentApprovedEmail(tx, {
    verificationId: verification.id,
    userId: verification.userId,
    userName: verification.user.name,
    userEmail: verification.user.email,
    planName: verification.plan.name,
    amount: verification.amount.toString(),
    currency: verification.currency,
    reference: verification.reference ?? verification.id,
    approvedAt: input.reviewedAt,
    activeUntil: period.endsAt,
  });
  return { verification, subscription, idempotent: false };
}

/**
 * Builds the JSON body for the admin review endpoint.
 *
 * The verification carries the plan with its entitlements, and
 * `PlanEntitlement.limitValue` is a BigInt. Serialising it directly made the
 * route throw after the transaction had already committed, so the admin saw an
 * error while the payment was in fact approved. Limits are converted to strings
 * here, the same way the plan endpoints do it.
 */
export function serializeReviewResponse<
  V extends {
    amount: { toString(): string };
    proofStoragePath?: string | null;
    proofMimeType?: string | null;
    proofSizeBytes?: bigint | null;
    proofChecksumSha256?: string | null;
    plan?: { entitlements?: ReadonlyArray<{ limitValue?: bigint | null }> } | null;
  },
  S,
>(input: { verification: V; subscription: S; idempotent: boolean }) {
  const payload: Record<string, unknown> = { ...input.verification };
  delete payload.proofStoragePath;
  delete payload.proofMimeType;
  delete payload.proofSizeBytes;
  delete payload.proofChecksumSha256;
  payload.amount = input.verification.amount.toString();
  const plan = input.verification.plan;
  if (plan) {
    payload.plan = {
      ...plan,
      entitlements: (plan.entitlements ?? []).map((item) => ({
        ...item,
        limitValue: item.limitValue?.toString() ?? null,
      })),
    };
  }
  payload.subscription = input.subscription;
  payload.idempotent = input.idempotent;
  return payload;
}
