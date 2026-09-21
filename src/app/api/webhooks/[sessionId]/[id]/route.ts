import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { MessageJobError } from "@/lib/message-job-errors";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-contract";
import { deleteWebhookEndpoint, updateWebhookEndpoint } from "@/lib/webhook-service";
import { WebhookTransportError } from "@/lib/webhook-transport";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES).or(z.literal("*"))).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).max(12).optional(),
  timeoutMs: z.number().int().min(1000).max(30_000).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

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

type Context = { params: Promise<{ sessionId: string; id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const input = updateSchema.parse(await request.json());
    const { sessionId, id } = await context.params;
    const data = await updateWebhookEndpoint(actor(user), sessionId, id, input, request.headers);
    return NextResponse.json({ status: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ status: false, error: "VALIDATION_ERROR", details: error.issues }, { status: 422 });
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, error: "Unauthorized" }, { status: 401 });
    const { sessionId, id } = await context.params;
    return NextResponse.json({ status: true, data: await deleteWebhookEndpoint(actor(user), sessionId, id, request.headers) });
  } catch (error) {
    return failure(error);
  }
}
