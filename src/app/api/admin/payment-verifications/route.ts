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
  const submissions = await prisma.paymentVerification.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ data: submissions.map((item) => ({ ...item, amount: item.amount.toString() })) });
}
