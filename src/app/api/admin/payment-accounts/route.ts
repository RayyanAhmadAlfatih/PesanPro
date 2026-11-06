import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, isAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import { getPaymentMethodsSnapshot } from "@/lib/payment-methods";
import { BANK_OPTIONS, isKnownBank } from "@/lib/bank-list";

// Nomor rekening disimpan tanpa spasi/dash. Panjang wajar rekening Indonesia:
// 6-20 digit (mis. BCA 10, Mandiri 13, BRI 15). Rekening kosong ditolak.
const ACCOUNT_NUMBER = /^\d{6,20}$/;

function auditAccountMeta(account: { id: string; bankName: string; accountNumber: string }) {
  // Aturan audit (F1.3): log hanya mencatat bank + 4 digit terakhir, jangan
  // nomor rekening lengkap.
  return {
    paymentAccountId: account.id,
    bankName: account.bankName,
    accountLast4: account.accountNumber.slice(-4),
  };
}

export async function GET(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [accounts, methods] = await Promise.all([
    prisma.paymentAccount.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { paymentVerifications: true } } },
    }),
    getPaymentMethodsSnapshot(),
  ]);

  return NextResponse.json({
    data: {
      accounts: accounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        isActive: account.isActive,
        isDefault: account.isDefault,
        sortOrder: account.sortOrder,
        usedCount: account._count.paymentVerifications,
        createdAt: account.createdAt,
      })),
      methods,
      bankOptions: BANK_OPTIONS,
    },
  });
}

const createSchema = z.object({
  bankName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(60),
  accountHolder: z.string().trim().min(2).max(160),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  if (!actor || !isAdmin(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment account", details: parsed.error.flatten() }, { status: 400 });

  // Rapatkan nomor: buang spasi/dash sebelum disimpan, lalu validasi bentuknya.
  const accountNumber = parsed.data.accountNumber.replace(/[\s-]/g, "");
  if (!ACCOUNT_NUMBER.test(accountNumber)) {
    return NextResponse.json(
      { error: "Nomor rekening harus 6-20 angka tanpa spasi atau tanda hubung.", code: "ACCOUNT_NUMBER_INVALID" },
      { status: 400 },
    );
  }
  if (!isKnownBank(parsed.data.bankName)) {
    return NextResponse.json(
      { error: "Pilih bank dari daftar yang tersedia.", code: "BANK_UNKNOWN" },
      { status: 400 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    // Satu rekening default saja. Rekening default juga selalu aktif,
    // supaya "default" tidak pernah berarti disembunyikan dari user.
    if (parsed.data.isDefault) {
      await tx.paymentAccount.updateMany({ data: { isDefault: false } });
    }
    const last = await tx.paymentAccount.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return tx.paymentAccount.create({
      data: {
        bankName: parsed.data.bankName,
        accountNumber,
        accountHolder: parsed.data.accountHolder,
        isActive: parsed.data.isDefault ? true : parsed.data.isActive,
        isDefault: parsed.data.isDefault,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  });

  await recordAudit({
    userId: actor.id,
    userEmail: actor.email,
    action: "payment_account.create",
    resource: "payment_account",
    resourceId: created.id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: auditAccountMeta(created),
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
