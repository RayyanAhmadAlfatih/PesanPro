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
import { getPaymentMethodsSnapshot } from "@/lib/payment-methods";
import { parseUserWhatsapp } from "@/lib/whatsapp-number";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
  // Nomor WhatsApp kontak (bukan nomor device). Wajib; bentuk akhirnya 62…
  // diverifikasi ulang lewat parseUserWhatsapp setelah zod membatasi bentuk
  // mentahnya, jadi aturan panjang/prefix hanya hidup di satu tempat.
  whatsappNumber: z.string().trim().min(1).max(40),
  password: passwordSchema,
  planId: z.string().min(1),
  reference: z.string().trim().min(3).max(120),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  // Rekening yang dipilih pembayar. Opsional di API supaya klien lama tidak
  // rusak; UI selalu mengirimnya saat daftar rekening tampil.
  bankAccountId: z.string().trim().max(64).optional(),
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
    bankAccountId: upload.fields.bankAccountId?.trim() || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration data provided" }, { status: 400 });
  }
  const { name, email, password, planId, reference, billingCycle } = parsed.data;

  const whatsapp = parseUserWhatsapp(parsed.data.whatsappNumber);
  if (!whatsapp.ok) {
    return NextResponse.json({ error: whatsapp.reason, code: "WHATSAPP_INVALID" }, { status: 400 });
  }

  const [config, methods] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { id: "default" },
      select: { enableRegistration: true, supportWhatsapp: true },
    }),
    getPaymentMethodsSnapshot(),
  ]);
  if (config && config.enableRegistration === false) {
    return NextResponse.json(
      { error: "Registration is currently disabled by the administrator" },
      { status: 403 },
    );
  }
  // Penjaga lama diperbarui (F1.4): terblokir hanya kalau TIDAK ADA cara bayar
  // yang siap sama sekali — bukan lagi kalau kolom rekening tunggal kosong.
  if (!methods.anyReady) {
    return NextResponse.json(
      {
        error: "Payment details are not configured yet. Contact the administrator.",
        code: "PAYMENT_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }
  // Manual belum siap tapi ada cara lain yang siap: alur transfer manual
  // tidak boleh dipakai, jadi rekening pilihan wajib ditolak.
  if (!methods.manual.ready) {
    return NextResponse.json(
      {
        error: "Transfer manual sedang tidak tersedia. Gunakan cara bayar lain yang tampil di halaman pendaftaran.",
        code: "MANUAL_TRANSFER_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  // Rekening pilihan harus rekening aktif yang memang ditampilkan ke user.
  let bankAccount: { id: string; bankName: string; accountNumber: string; accountHolder: string } | null = null;
  if (parsed.data.bankAccountId) {
    const account = await prisma.paymentAccount.findFirst({
      where: { id: parsed.data.bankAccountId, isActive: true },
      select: { id: true, bankName: true, accountNumber: true, accountHolder: true },
    });
    if (!account) {
      return NextResponse.json(
        { error: "Rekening tujuan tidak tersedia. Pilih salah satu rekening yang tercantum.", code: "BANK_ACCOUNT_UNAVAILABLE" },
        { status: 400 },
      );
    }
    bankAccount = account;
  } else if (methods.manual.ready) {
    // Tidak dikirim tapi alur manual dipakai: pakai rekening default agar
    // riwayat pembayaran tetap terhubung ke rekening yang ditampilkan.
    bankAccount = await prisma.paymentAccount.findFirst({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, bankName: true, accountNumber: true, accountHolder: true },
    });
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
        data: { id: userId, name, email, password: hashedPassword, whatsappNumber: whatsapp.normalized },
      });
      await provisionDefaultSubscriptionInTransaction(tx, user.id);
      const verification = await tx.paymentVerification.create({
        data: {
          id: verificationId,
          userId: user.id,
          planId: plan.id,
          bankAccountId: bankAccount?.id ?? null,
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
        // Ditampilkan ulang di layar PENDING supaya pembayar bisa mencocokkan
        // transfernya tanpa membuka halaman lain.
        account: bankAccount
          ? { bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber, accountHolder: bankAccount.accountHolder }
          : null,
      },
      // Nomor bantuan yang sama dengan halaman Bantuan dashboard (F1.2),
      // bukan nomor admin kedua.
      supportWhatsapp: config?.supportWhatsapp ?? "",
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
