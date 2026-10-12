import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { deleteStoredPaymentProof, parsePaymentProofUpload, storePaymentProof } from "@/lib/payment-proof";
import { MessageJobError } from "@/lib/message-job-errors";
import { queuePaymentSubmittedEmails } from "@/lib/email-notifications";
import { logger } from "@/lib/logger";

const submissionSchema = z.object({
  planId: z.string().min(1),
  reference: z.string().trim().min(3).max(120),
  // Omitted means monthly, which is what every submission meant before the
  // yearly option existed.
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});

function publicSubmission<T extends {
  amount: { toString(): string };
  proofStoragePath: string | null;
  proofMimeType: string | null;
  proofSizeBytes: bigint | null;
  proofChecksumSha256: string | null;
}>(item: T) {
  return {
    ...item,
    amount: item.amount.toString(),
    proofStoragePath: undefined,
    proofMimeType: undefined,
    proofSizeBytes: undefined,
    proofChecksumSha256: undefined,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const submissions = await prisma.paymentVerification.findMany({
    where: { userId: session.user.id },
    include: { plan: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    data: submissions.map(publicSubmission),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false || session.user.role !== "USER") {
    return NextResponse.json({ error: "Only an active user can submit payment proof" }, { status: 403 });
  }
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`payment-proof:${session.user.id}:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many payment submissions", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitHeaders(rateLimit, 5) });
  }
  // Parse the multipart body as a stream so an oversized (or chunked) body can
  // never be buffered in full before the size limit is applied.
  let upload: Awaited<ReturnType<typeof parsePaymentProofUpload>>;
  try {
    upload = await parsePaymentProofUpload(request);
  } catch (error) {
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Invalid payment proof" }, { status: 400 });
  }
  const parsed = submissionSchema.safeParse({
    planId: upload.planId,
    reference: upload.reference,
    billingCycle: upload.billingCycle.trim() || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment proof", details: parsed.error.flatten() }, { status: 400 });

  const plan = await prisma.plan.findFirst({ where: { id: parsed.data.planId, isActive: true, priceMonthly: { gt: 0 } } });
  if (!plan) return NextResponse.json({ error: "Active plan not found" }, { status: 404 });
  // The amount is always read from the plan, never from the request body, so a
  // caller cannot declare a cheaper price for a yearly period.
  const amount = parsed.data.billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  if (!amount) {
    return NextResponse.json(
      { error: "This plan does not offer a yearly price", code: "PLAN_YEARLY_PRICE_MISSING" },
      { status: 422 },
    );
  }
  const verificationId = crypto.randomUUID();
  let storedProof: Awaited<ReturnType<typeof storePaymentProof>> | null = null;
  let submission;
  let queuedEmailCount = 0;
  try {
    storedProof = await storePaymentProof({
      userId: session.user.id,
      verificationId,
      declaredMimeType: upload.declaredMimeType,
      buffer: upload.buffer,
    });
    const proofRecord = storedProof;
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentVerification.create({
        data: {
          id: verificationId,
          userId: session.user.id,
          planId: plan.id,
          amount,
          billingCycle: parsed.data.billingCycle,
          currency: plan.currency,
          reference: parsed.data.reference,
          proofUrl: `/api/payment-verifications/${verificationId}/proof`,
          proofStoragePath: proofRecord.storagePath,
          proofMimeType: proofRecord.mimeType,
          proofSizeBytes: proofRecord.sizeBytes,
          proofChecksumSha256: proofRecord.checksumSha256,
        },
      });
      const notifications = await queuePaymentSubmittedEmails(tx, {
        verificationId: record.id,
        payerId: record.userId,
        planName: plan.name,
        amount: amount.toString(),
        currency: plan.currency,
        reference: parsed.data.reference,
        submittedAt: record.createdAt,
      });
      return { record, notifications };
    });
    submission = created.record;
    queuedEmailCount = created.notifications;
  } catch (error) {
    if (storedProof) await deleteStoredPaymentProof(storedProof.storagePath, verificationId);
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
  await recordAudit({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "payment_verification.submit",
    resource: "payment_verification",
    resourceId: submission.id,
    ip,
    userAgent: request.headers.get("user-agent"),
    meta: { planId: plan.id, amount: amount.toString(), billingCycle: parsed.data.billingCycle, currency: plan.currency, queuedEmailCount },
  });
  if (queuedEmailCount === 0) {
    logger.warn("PaymentVerification", `No active superadmin recipient was found for payment ${submission.id}`);
  }
  return NextResponse.json({ data: publicSubmission(submission) }, { status: 201 });
}
