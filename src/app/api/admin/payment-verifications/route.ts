import { PaymentVerificationStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requestedStatus = request.nextUrl.searchParams.get("status");
  const status = requestedStatus && Object.values(PaymentVerificationStatus).includes(requestedStatus as PaymentVerificationStatus)
    ? requestedStatus as PaymentVerificationStatus
    : undefined;
  // Laporan pendapatan dihitung langsung dari database (bukan dari daftar 200
  // baris di bawah) supaya totalnya tetap akurat setelah daftar melewati batas.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [submissions, approvedAgg, monthApprovedAgg, pendingAgg, planBreakdown] = await Promise.all([
    prisma.paymentVerification.findMany({
      where: status ? { status } : undefined,
      include: {
        // whatsappNumber hanya untuk admin (F1.1): dipakai untuk konfirmasi
        // pembayaran lewat wa.me. Tidak pernah dikirim ke tenant lain.
        user: { select: { id: true, email: true, name: true, whatsappNumber: true } },
        plan: { select: { id: true, code: true, name: true } },
        bankAccount: { select: { id: true, bankName: true, accountNumber: true, accountHolder: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.paymentVerification.aggregate({
      where: { status: PaymentVerificationStatus.APPROVED },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentVerification.aggregate({
      where: { status: PaymentVerificationStatus.APPROVED, reviewedAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentVerification.aggregate({
      where: { status: PaymentVerificationStatus.PENDING },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.paymentVerification.groupBy({
      by: ["planId", "billingCycle", "currency"],
      where: { status: PaymentVerificationStatus.APPROVED, planId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const planRows = await prisma.plan.findMany({
    where: { id: { in: planBreakdown.map((row) => row.planId).filter((id): id is string => id !== null) } },
    select: { id: true, code: true, name: true },
  });
  const planNames = new Map(planRows.map((plan) => [plan.id, plan]));
  const decimal = (value: { toString(): string } | null) => (value ? value.toString() : "0");
  return NextResponse.json({
    summary: {
      monthStart: monthStart.toISOString(),
      approved: { count: approvedAgg._count._all, total: decimal(approvedAgg._sum.amount) },
      approvedThisMonth: { count: monthApprovedAgg._count._all, total: decimal(monthApprovedAgg._sum.amount) },
      pending: { count: pendingAgg._count._all, total: decimal(pendingAgg._sum.amount) },
      byPlan: planBreakdown.map((row) => ({
        planId: row.planId,
        planName: row.planId ? planNames.get(row.planId)?.name ?? null : null,
        planCode: row.planId ? planNames.get(row.planId)?.code ?? null : null,
        billingCycle: row.billingCycle,
        currency: row.currency,
        count: row._count._all,
        total: decimal(row._sum.amount),
      })),
    },
    data: submissions.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      proofStoragePath: undefined,
      proofMimeType: undefined,
      proofSizeBytes: undefined,
      proofChecksumSha256: undefined,
    })),
  });
}
