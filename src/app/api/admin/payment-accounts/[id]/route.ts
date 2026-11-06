import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { isKnownBank } from "@/lib/bank-list";

const ACCOUNT_NUMBER = /^\d{6,20}$/;

function auditMeta(account: { id: string; bankName: string; accountNumber: string }) {
  // Aturan audit (F1.3): bank + 4 digit terakhir saja, jangan nomor lengkap.
  return {
    paymentAccountId: account.id,
    bankName: account.bankName,
    accountLast4: account.accountNumber.slice(-4),
  };
}

const patchSchema = z.object({
  bankName: z.string().trim().min(1).max(120).optional(),
  accountNumber: z.string().trim().min(1).max(60).optional(),
  accountHolder: z.string().trim().min(2).max(160).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment account", details: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.paymentAccount.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Payment account not found" }, { status: 404 });

  const data: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
    isActive?: boolean;
    isDefault?: boolean;
  } = {};

  if (parsed.data.bankName !== undefined) {
    if (!isKnownBank(parsed.data.bankName)) {
      return NextResponse.json({ error: "Pilih bank dari daftar yang tersedia.", code: "BANK_UNKNOWN" }, { status: 400 });
    }
    data.bankName = parsed.data.bankName;
  }
  if (parsed.data.accountNumber !== undefined) {
    const accountNumber = parsed.data.accountNumber.replace(/[\s-]/g, "");
    if (!ACCOUNT_NUMBER.test(accountNumber)) {
      return NextResponse.json(
        { error: "Nomor rekening harus 6-20 angka tanpa spasi atau tanda hubung.", code: "ACCOUNT_NUMBER_INVALID" },
        { status: 400 },
      );
    }
    data.accountNumber = accountNumber;
  }
  if (parsed.data.accountHolder !== undefined) data.accountHolder = parsed.data.accountHolder;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.isDefault !== undefined) data.isDefault = parsed.data.isDefault;

  // Menonaktifkan rekening default: default dipindah otomatis ke rekening
  // aktif pertama supaya user tidak pernah kehilangan rekening tujuan.
  const deactivatingDefault = data.isActive === false && existing.isDefault;
  if (deactivatingDefault) data.isDefault = false;
  if (data.isDefault) data.isActive = true;

  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.paymentAccount.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
    }
    const account = await tx.paymentAccount.update({ where: { id }, data });
    if (deactivatingDefault) {
      const nextDefault = await tx.paymentAccount.findFirst({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (nextDefault) {
        await tx.paymentAccount.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
      }
    }
    return account;
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: deactivatingDefault
      ? "payment_account.deactivate"
      : parsed.data.isDefault
        ? "payment_account.set_default"
        : "payment_account.update",
    resource: "payment_account",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: {
      ...auditMeta(updated),
      // Perubahan yang relevan untuk audit tanpa menampikan nomor lengkap.
      changedFields: Object.keys(parsed.data).filter((key) => key !== "accountNumber"),
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.paymentAccount.findUnique({
    where: { id },
    include: { _count: { select: { paymentVerifications: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Payment account not found" }, { status: 404 });

  // F1.3: rekening yang pernah dipakai pembayaran tidak boleh dihapus
  // permanen — riwayat lama harus tetap bisa dicocokkan. Nonaktifkan saja.
  if (existing._count.paymentVerifications > 0) {
    return NextResponse.json(
      {
        error: "Rekening ini sudah pernah dipakai pembayaran dan tidak bisa dihapus. Nonaktifkan saja supaya riwayat tetap bisa dicocokkan.",
        code: "ACCOUNT_IN_USE",
      },
      { status: 409 },
    );
  }

  await prisma.paymentAccount.delete({ where: { id } });
  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "payment_account.delete",
    resource: "payment_account",
    resourceId: id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: auditMeta(existing),
  });

  return NextResponse.json({ data: { id } });
}
