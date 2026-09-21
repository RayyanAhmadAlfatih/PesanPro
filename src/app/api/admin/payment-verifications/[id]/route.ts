import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

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
  const claimed = await prisma.paymentVerification.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: parsed.data.status,
      reviewNote: parsed.data.reviewNote,
      reviewerEmail: actor.email,
      reviewedAt,
    },
  });
  if (claimed.count === 0) return NextResponse.json({ error: "Pending payment verification not found" }, { status: 409 });
  const verification = await prisma.paymentVerification.findUnique({ where: { id } });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: `payment_verification.${parsed.data.status.toLowerCase()}`,
    resource: "payment_verification",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { reviewNote: parsed.data.reviewNote },
  });
  return NextResponse.json({ data: verification && { ...verification, amount: verification.amount.toString() } });
}
