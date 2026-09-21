import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { MessageJobError } from "@/lib/message-job-errors";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-contract";
import { createWebhookEndpoint, listWebhookEndpoints } from "@/lib/webhook-service";
import { WebhookTransportError } from "@/lib/webhook-transport";

const eventSchema = z.enum(WEBHOOK_EVENT_TYPES).or(z.literal("*"));
const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().url().max(2048),
  secret: z.string().min(32).max(512).optional(),
  events: z.array(eventSchema).min(1).max(50),
  maxAttempts: z.number().int().min(1).max(12).optional(),
  timeoutMs: z.number().int().min(1000).max(30_000).optional(),
});

function actor(user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>) {
  return { id: user.id, role: user.role, ownerId: user.ownerId, email: user.email };
}
function failure(error: unknown) {
  const commercial = commercialErrorResponse(error);
  if (commercial) return commercial;
  if (error instanceof MessageJobError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: error.status });
  if (error instanceof WebhookTransportError) return NextResponse.json({ status: false, error: error.code, message: error.message }, { status: 422 });
  return NextResponse.json({ status: false, error: "INTERNAL_ERROR", message: "Webhook operation failed" }, { status: 500 });
}

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId } = await context.params;
    const data = await listWebhookEndpoints(actor(user), sessionId);
    return NextResponse.json({ status: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const input = createSchema.parse(await request.json());
    const { sessionId } = await context.params;
    const result = await createWebhookEndpoint(actor(user), sessionId, input, request.headers);
    return NextResponse.json({
      status: true,
      message: "Webhook endpoint created. Store the signing secret now; it cannot be shown again.",
      data: result.endpoint,
      secret: result.secret,
      secretPreview: result.secretPreview,
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ status: false, error: "VALIDATION_ERROR", details: error.issues }, { status: 422 });
    return failure(error);
  }
}
