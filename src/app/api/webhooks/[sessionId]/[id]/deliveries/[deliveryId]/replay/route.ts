import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { replayWebhookDelivery } from "@/lib/webhook-service";

type Context = { params: Promise<{ sessionId: string; id: string; deliveryId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id, deliveryId } = await context.params;
    const data = await replayWebhookDelivery({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email }, sessionId, id, deliveryId, request.headers);
    return NextResponse.json({ status: true, data }, { status: 202 });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook delivery could not be replayed" }, { status: 500 });
  }
}

