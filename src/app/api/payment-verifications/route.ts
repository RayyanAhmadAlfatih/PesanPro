import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

const submissionSchema = z.object({
  planId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  reference: z.string().trim().min(3).max(120),
  proofUrl: z.string().url().max(2048).refine((url) => url.startsWith("https://"), "Proof URL must use HTTPS"),
});

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
    data: submissions.map((item) => ({ ...item, amount: item.amount.toString() })),
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
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment proof", details: parsed.error.flatten() }, { status: 400 });

  const plan = await prisma.plan.findFirst({ where: { id: parsed.data.planId, isActive: true, priceMonthly: { gt: 0 } } });
  if (!plan) return NextResponse.json({ error: "Active plan not found" }, { status: 404 });
  if (!plan.priceMonthly?.equals(parsed.data.amount)) {
    return NextResponse.json({ error: "Payment amount must match the selected plan price", code: "PAYMENT_AMOUNT_MISMATCH" }, { status: 400 });
  }
  const submission = await prisma.paymentVerification.create({
    data: {
      userId: session.user.id,
      planId: plan.id,
      amount: parsed.data.amount,
      currency: plan.currency,
      reference: parsed.data.reference,
      proofUrl: parsed.data.proofUrl,
    },
  });
  await recordAudit({
    userId: session.user.id,
    userEmail: session.user.email ?? null,
    action: "payment_verification.submit",
    resource: "payment_verification",
    resourceId: submission.id,
    ip,
    userAgent: request.headers.get("user-agent"),
    meta: { planId: plan.id, amount: parsed.data.amount, currency: plan.currency },
  });
  return NextResponse.json({ data: { ...submission, amount: submission.amount.toString() } }, { status: 201 });
}
