import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { listWebhookDeliveries } from "@/lib/webhook-service";

type Context = { params: Promise<{ sessionId: string; id: string }> };

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id } = await context.params;
    const result = await listWebhookDeliveries(
      { id: user.id, role: user.role, ownerId: user.ownerId, email: user.email },
      sessionId,
      id,
      {
        limit: parseBoundedInt(request.nextUrl.searchParams.get("limit"), 50, 1, 200),
        offset: parseBoundedInt(request.nextUrl.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
      },
    );
    return NextResponse.json({ status: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook deliveries could not be loaded" }, { status: 500 });
  }
}
