import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { loadPaymentProof } from "@/lib/payment-proof";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const verification = await prisma.paymentVerification.findUnique({
    where: { id },
    select: { userId: true, proofUrl: true },
  });
  if (!verification || (actor.role !== "SUPERADMIN" && verification.userId !== actor.id)) {
    return NextResponse.json({ error: "Payment proof not found" }, { status: 404 });
  }
  if (verification.proofUrl !== `/api/payment-verifications/${id}/proof`) {
    return NextResponse.json({ error: "Stored payment proof not found" }, { status: 404 });
  }
  try {
    const proof = await loadPaymentProof(verification.userId, id);
    return new NextResponse(new Uint8Array(proof.buffer), {
      headers: {
        "Content-Type": proof.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MessageJobError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
