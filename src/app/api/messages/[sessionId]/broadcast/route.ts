import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { createBroadcast } from "@/lib/broadcast-service";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { MessageJobError } from "@/lib/message-job-errors";

const legacyBroadcastSchema = z.object({
  recipients: z.array(z.string().trim().min(3).max(191)).min(1).max(5000),
  message: z.string().min(1).max(4096),
  delay: z.number().int().min(500).max(60_000).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  mediaId: z.string().trim().min(1).max(191).optional(),
  requireOptIn: z.boolean().optional(),
}).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ status: false, message: "Unauthorized" }, { status: 401 });
    const input = legacyBroadcastSchema.parse(await request.json());
    const { sessionId } = await params;
    const delayMinMs = Math.max(2000, input.delay ?? 2000);
    const providedKey = request.headers.get("idempotency-key")?.trim();
    const createKey = providedKey && /^[A-Za-z0-9._:-]{8,128}$/.test(providedKey)
      ? providedKey
      : `legacy-${crypto.randomUUID()}`;
    const result = await createBroadcast(
      { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
      {
        sessionId,
        name: input.name,
        recipients: input.recipients,
        message: input.message,
        mediaId: input.mediaId,
        delayMinMs,
        delayMaxMs: Math.min(120_000, Math.max(delayMinMs, Math.round(delayMinMs * 1.5))),
        requireOptIn: input.requireOptIn ?? false,
      },
      createKey,
    );
    return NextResponse.json({
      status: true,
      message: result.idempotent ? "Broadcast already queued" : "Broadcast queued",
      data: { broadcastId: result.broadcast.id, total: result.broadcast.progress.total, idempotent: result.idempotent },
    }, { status: result.idempotent ? 200 : 202 });
  } catch (error) {
    const commercial = commercialErrorResponse(error);
    if (commercial) return commercial;
    if (error instanceof MessageJobError) {
      return NextResponse.json({ status: false, message: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ status: false, message: "Invalid broadcast request", error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ status: false, message: "Failed to queue broadcast" }, { status: 500 });
  }
}
