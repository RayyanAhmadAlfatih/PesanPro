import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const billing = await getBillingSnapshot(session.user.id);
  if (!billing) return NextResponse.json({ error: "Billing subscription not found" }, { status: 404 });

  const [usage, profile] = await Promise.all([
    prisma.usageCounter.findMany({
      where: { tenantId: billing.tenantId, periodEnd: { gt: new Date() } },
      select: { feature: true, consumed: true, reserved: true, periodStart: true, periodEnd: true },
      orderBy: { feature: "asc" },
    }),
    // Nomor WA kontak milik user sendiri (F1.1): dipakai halaman Tagihan untuk
    // menampilkan field isian hanya kalau belum tersimpan.
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { whatsappNumber: true },
    }),
  ]);

  return NextResponse.json({
    data: {
      ...billing,
      whatsappNumber: profile?.whatsappNumber ?? null,
      usage: usage.map((item) => ({
        ...item,
        consumed: item.consumed.toString(),
        reserved: item.reserved.toString(),
      })),
    },
  });
}
