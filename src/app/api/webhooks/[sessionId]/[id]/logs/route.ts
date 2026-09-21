import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { listWebhookDeliveries } from "@/lib/webhook-service";

type Context = { params: Promise<{ sessionId: string; id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id } = await context.params;
    const result = await listWebhookDeliveries(
      { id: user.id, role: user.role, ownerId: user.ownerId, email: user.email },
      sessionId,
      id,
      { limit: Number(request.nextUrl.searchParams.get("limit") || 50), offset: Number(request.nextUrl.searchParams.get("offset") || 0) },
    );
    return NextResponse.json({ status: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook deliveries could not be loaded" }, { status: 500 });
  }
}
