import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import {
  PaymentVerificationReviewError,
  reviewPaymentVerificationInTransaction,
} from "@/lib/payment-verification-service";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
  reviewNote: z.string().trim().min(3).max(2000),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review", details: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const reviewedAt = new Date();
  let result;
  try {
    result = await prisma.$transaction((tx) => reviewPaymentVerificationInTransaction(tx, {
      verificationId: id,
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote,
      reviewerEmail: actor.email,
      reviewedAt,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof PaymentVerificationReviewError) {
      const status = error.code === "PAYMENT_NOT_PENDING" ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    throw error;
  }
  if (!result.idempotent) {
    await recordAudit({
      userId: actor.id,
      userEmail: actor.email,
      action: `payment_verification.${parsed.data.status.toLowerCase()}`,
      resource: "payment_verification",
      resourceId: id,
      ip: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      meta: {
        reviewNote: parsed.data.reviewNote,
        planId: result.verification.planId,
        subscriptionId: result.subscription?.id ?? null,
        subscriptionActivated: Boolean(result.subscription),
      },
    });
  }
  return NextResponse.json({
    data: {
      ...result.verification,
      amount: result.verification.amount.toString(),
      subscription: result.subscription,
      idempotent: result.idempotent,
    },
  });
}
