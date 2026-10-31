import crypto from "node:crypto";
import { NextResponse, NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/password-policy";
import { recordAudit } from "@/lib/audit";
import { provisionDefaultSubscriptionInTransaction } from "@/lib/billing";
import { queuePaymentSubmittedEmails } from "@/lib/email-notifications";
import { MessageJobError } from "@/lib/message-job-errors";
import { deleteStoredPaymentProof, storePaymentProof } from "@/lib/payment-proof";
import { parseRegistrationUpload } from "@/lib/registration-upload";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  password: passwordSchema,
  planId: z.string().min(1),
  reference: z.string().trim().min(3).max(120),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour.
  const ip = getClientIp(req.headers);
  const rl = await checkPersistentRateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many registration attempts, please try again later" },
      { status: 429, headers: rateLimitHeaders(rl, 5) },
    );
  }

  let upload: Awaited<ReturnType<typeof parseRegistrationUpload>>;
  try {
    upload = await parseRegistrationUpload(req);
  } catch (error) {
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Invalid registration data provided" }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse({
    ...upload.fields,
    billingCycle: upload.fields.billingCycle.trim() || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration data provided" }, { status: 400 });
  }
  const { name, email, password, planId, reference, billingCycle } = parsed.data;

  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: {
      enableRegistration: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountHolder: true,
    },
  });
  if (config && config.enableRegistration === false) {
    return NextResponse.json(
      { error: "Registration is currently disabled by the administrator" },
      { status: 403 },
    );
  }
  const paymentReady = Boolean(config?.bankName && config.bankAccountNumber && config.bankAccountHolder);
  if (!paymentReady) {
    return NextResponse.json(
      {
        error: "Payment details are not configured yet. Contact the administrator.",
        code: "PAYMENT_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  // Return the same generic rejection as any other validation failure so the
  // endpoint cannot be used to enumerate registered emails.
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    return NextResponse.json({ error: "Invalid registration data provided" }, { status: 400 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: planId, isActive: true, priceMonthly: { gt: 0 } },
    select: { id: true, name: true, currency: true, priceMonthly: true, priceYearly: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "The selected plan is not available", code: "PLAN_UNAVAILABLE" }, { status: 404 });
  }
  const amount = billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  if (!amount) {
    return NextResponse.json(
      { error: "This plan does not offer a yearly price", code: "PLAN_YEARLY_PRICE_MISSING" },
      { status: 422 },
    );
  }

  const userId = crypto.randomUUID();
  const verificationId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password, 12);

  let storedProof: Awaited<ReturnType<typeof storePaymentProof>> | null = null;
  try {
    storedProof = await storePaymentProof({
      userId,
      verificationId,
      declaredMimeType: upload.declaredMimeType,
      buffer: upload.buffer,
    });

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: userId, name, email, password: hashedPassword },
      });
      await provisionDefaultSubscriptionInTransaction(tx, user.id);
      const verification = await tx.paymentVerification.create({
        data: {
          id: verificationId,
          userId: user.id,
          planId: plan.id,
          amount,
          billingCycle,
          currency: plan.currency,
          reference,
          proofUrl: `/api/payment-verifications/${verificationId}/proof`,
          proofStoragePath: storedProof!.storagePath,
          proofMimeType: storedProof!.mimeType,
          proofSizeBytes: storedProof!.sizeBytes,
          proofChecksumSha256: storedProof!.checksumSha256,
        },
      });
      const notifications = await queuePaymentSubmittedEmails(tx, {
        verificationId: verification.id,
        payerId: user.id,
        planName: plan.name,
        amount: amount.toString(),
        currency: plan.currency,
        reference,
        submittedAt: verification.createdAt,
      });
      return { user, verification, notifications };
    });

    await recordAudit({
      userId: created.user.id,
      userEmail: created.user.email,
      action: "user.register",
      resource: "user",
      resourceId: created.user.id,
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      message: "Account created. Your payment proof is waiting for review.",
      user: { id: created.user.id, name: created.user.name, email: created.user.email },
      payment: {
        status: created.verification.status,
        planName: plan.name,
        amount: amount.toString(),
        currency: plan.currency,
      },
    });
  } catch (error) {
    if (storedProof) {
      await deleteStoredPaymentProof(storedProof.storagePath, verificationId).catch(() => undefined);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Invalid registration data provided" }, { status: 400 });
    }
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Internal server error during registration" }, { status: 500 });
  }
}
