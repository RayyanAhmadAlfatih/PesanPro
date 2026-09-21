import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { MessageJobError } from "@/lib/message-job-errors";
import { rotateWebhookSecret } from "@/lib/webhook-service";

type Context = { params: Promise<{ sessionId: string; id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id } = await context.params;
    const result = await rotateWebhookSecret({ id: user.id, role: user.role, ownerId: user.ownerId, email: user.email }, sessionId, id, request.headers);
    return NextResponse.json({ status: true, message: "Store the new signing secret now; it cannot be shown again.", data: result.endpoint, secret: result.secret, secretPreview: result.secretPreview }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook secret could not be rotated" }, { status: 500 });
  }
}

