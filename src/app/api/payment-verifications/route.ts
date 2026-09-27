import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { deleteStoredPaymentProof, PAYMENT_PROOF_MAX_BYTES, storePaymentProof } from "@/lib/payment-proof";
import { MessageJobError } from "@/lib/message-job-errors";
import { queuePaymentSubmittedEmails } from "@/lib/email-notifications";
import { logger } from "@/lib/logger";

const submissionSchema = z.object({
  planId: z.string().min(1),
  reference: z.string().trim().min(3).max(120),
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
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > PAYMENT_PROOF_MAX_BYTES + 256 * 1024) {
    return NextResponse.json({ error: "Payment proof must be 5 MB or smaller", code: "PAYMENT_PROOF_TOO_LARGE" }, { status: 413 });
  }
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`payment-proof:${session.user.id}:${ip}`, 5, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many payment submissions", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitHeaders(rateLimit, 5) });
  }
  const form = await request.formData().catch(() => null);
  const proof = form?.get("proof");
  const parsed = submissionSchema.safeParse({
    planId: form?.get("planId"),
    reference: form?.get("reference"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment proof", details: parsed.error.flatten() }, { status: 400 });
  if (!proof || typeof proof === "string") {
    return NextResponse.json({ error: "Payment proof file is required" }, { status: 400 });
  }

  const plan = await prisma.plan.findFirst({ where: { id: parsed.data.planId, isActive: true, priceMonthly: { gt: 0 } } });
  if (!plan) return NextResponse.json({ error: "Active plan not found" }, { status: 404 });
  const verificationId = crypto.randomUUID();
  let storedProof: Awaited<ReturnType<typeof storePaymentProof>> | null = null;
  let submission;
  let queuedEmailCount = 0;
  try {
    const buffer = Buffer.from(await proof.arrayBuffer());
    storedProof = await storePaymentProof({
      userId: session.user.id,
      verificationId,
      declaredMimeType: proof.type,
      buffer,
    });
    const proofRecord = storedProof;
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.paymentVerification.create({
        data: {
          id: verificationId,
          userId: session.user.id,
          planId: plan.id,
          amount: plan.priceMonthly!,
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
        amount: plan.priceMonthly!.toString(),
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
    meta: { planId: plan.id, amount: plan.priceMonthly!.toString(), currency: plan.currency, queuedEmailCount },
  });
  if (queuedEmailCount === 0) {
    logger.warn("PaymentVerification", `No active superadmin recipient was found for payment ${submission.id}`);
  }
  return NextResponse.json({ data: publicSubmission(submission) }, { status: 201 });
}
