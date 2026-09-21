import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rotateApiKey } from "@/lib/api-key-service";
import { EntitlementDeniedError, SubscriptionInactiveError } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`api-key-rotate:${session.user.id}:${ip}`, 10, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many API key operations", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitHeaders(rateLimit, 10) });
  }

  try {
    const key = await rotateApiKey(session.user.id, id);
    if (!key) return NextResponse.json({ error: "Active API key not found" }, { status: 404 });

    await recordAudit({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "api_key.rotate",
      resource: "api_key",
      resourceId: key.id,
      ip,
      userAgent: request.headers.get("user-agent"),
      meta: { previousKeyId: id, preview: key.preview },
    });
    return NextResponse.json({ data: key });
  } catch (error) {
    if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
