import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPaymentMethodsSnapshot, serializePaymentMethodsForPublic } from "@/lib/payment-methods";

export const dynamic = "force-dynamic";

/**
 * Public onboarding payload for the sign-up screen.
 *
 * Registration happens before the account exists, so this route cannot require
 * a session. It exposes only what a payer needs: the paid plans, the payment
 * methods the operator enabled, and the active manual bank accounts. Everything
 * else in SystemConfig stays behind the superadmin settings route.
 *
 * `supportWhatsapp` is the same help number the dashboard Support page shows;
 * the PENDING screen after submitting a proof links to it (owner decision,
 * 5 Nov 2026) instead of introducing a second admin number.
 */
export async function GET() {
  const [config, plans, methods] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { id: "default" },
      select: {
        paymentNote: true,
        enableRegistration: true,
        supportWhatsapp: true,
      },
    }),
    prisma.plan.findMany({
      where: { isActive: true, priceMonthly: { gt: 0 } },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        entitlements: {
          select: { feature: true, enabled: true, limitValue: true },
          orderBy: { feature: "asc" },
        },
      },
      orderBy: [{ priceMonthly: "asc" }, { createdAt: "asc" }],
    }),
    getPaymentMethodsSnapshot(),
  ]);

  const accounts = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    select: { id: true, bankName: true, accountNumber: true, accountHolder: true, isDefault: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    {
      data: {
        registrationEnabled: config?.enableRegistration ?? true,
        supportWhatsapp: config?.supportWhatsapp ?? "",
        payment: {
          note: config?.paymentNote ?? "",
          accounts: accounts.map((account) => ({ ...account })),
          methods: serializePaymentMethodsForPublic(methods),
          // Penjaga lama dipertahankan: pendaftaran terblokir kalau tidak ada
          // cara bayar yang siap sama sekali.
          ready: methods.anyReady,
        },
        plans: plans.map((plan) => ({
          ...plan,
          priceMonthly: plan.priceMonthly?.toString() ?? null,
          priceYearly: plan.priceYearly?.toString() ?? null,
          entitlements: plan.entitlements.map((item) => ({
            ...item,
            limitValue: item.limitValue?.toString() ?? null,
          })),
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
