import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";

const reorderSchema = z.object({
  // Urutan penuh rekening aktif, dari atas ke bawah, sebagaimana tampil ke user.
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reorder payload", details: parsed.error.flatten() }, { status: 400 });

  const ids = parsed.data.ids;
  const accounts = await prisma.paymentAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, bankName: true, accountNumber: true },
  });
  if (accounts.length !== ids.length || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Daftar urutan tidak cocok dengan rekening yang ada." }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.paymentAccount.update({ where: { id }, data: { sortOrder: index + 1 } })),
  );

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "payment_account.reorder",
    resource: "payment_account",
    resourceId: null,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { order: ids.map((id) => ({ id, accountLast4: accounts.find((a) => a.id === id)?.accountNumber.slice(-4) })) },
  });

  return NextResponse.json({ data: { ids } });
}
