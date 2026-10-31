import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectiveEntitlement, SubscriptionInactiveError } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const BYTES_PER_MB = 1024 * 1024;

/**
 * The dashboard needs the tenant's own upload ceiling to validate a file
 * before it leaves the browser. The server still enforces the same number, so
 * this endpoint is a convenience, never the authority.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const platformLimitBytes = getEnv().MAX_UPLOAD_SIZE_MB * BYTES_PER_MB;
  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { plan: { select: { name: true, code: true } } },
  });

  try {
    const entitlement = await getEffectiveEntitlement(session.user.id, "MEDIA_MAX_UPLOAD_BYTES");
    const planLimitBytes = entitlement.limit === null ? null : Number(entitlement.limit);
    const maxUploadBytes = entitlement.enabled
      ? Math.min(planLimitBytes ?? platformLimitBytes, platformLimitBytes)
      : 0;

    return NextResponse.json({
      data: {
        canUpload: maxUploadBytes > 0,
        maxUploadBytes,
        planLimitBytes,
        platformLimitBytes,
        planName: subscription?.plan.name ?? null,
        planCode: subscription?.plan.code ?? null,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (!(error instanceof SubscriptionInactiveError)) throw error;
    return NextResponse.json({
      data: {
        canUpload: false,
        maxUploadBytes: 0,
        planLimitBytes: 0,
        platformLimitBytes,
        planName: subscription?.plan.name ?? null,
        planCode: subscription?.plan.code ?? null,
      },
    }, { headers: { "cache-control": "no-store" } });
  }
}
