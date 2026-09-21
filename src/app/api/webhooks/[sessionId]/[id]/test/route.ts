import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { queueWebhookTest } from "@/lib/webhook-service";

type Context = { params: Promise<{ sessionId: string; id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id } = await context.params;
    const queued = await queueWebhookTest({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email }, sessionId, id, request.headers);
    return NextResponse.json({ status: true, message: "Webhook test queued", data: { ...queued, success: true, testing: false } }, { status: 202 });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook test could not be queued" }, { status: 500 });
  }
}
