import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public onboarding payload for the sign-up screen.
 *
 * Registration happens before the account exists, so this route cannot require
 * a session. It exposes only what a payer needs: the paid plans and the bank
 * account the operator configured. Everything else in SystemConfig stays
 * behind the superadmin settings route.
 */
export async function GET() {
  const [config, plans] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { id: "default" },
      select: {
        bankName: true,
        bankAccountNumber: true,
        bankAccountHolder: true,
        paymentNote: true,
        enableRegistration: true,
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
  ]);

  const payment = {
    bankName: config?.bankName ?? "",
    bankAccountNumber: config?.bankAccountNumber ?? "",
    bankAccountHolder: config?.bankAccountHolder ?? "",
    note: config?.paymentNote ?? "",
  };

  return NextResponse.json(
    {
      data: {
        registrationEnabled: config?.enableRegistration ?? true,
        payment: {
          ...payment,
          ready: Boolean(payment.bankName && payment.bankAccountNumber && payment.bankAccountHolder),
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
