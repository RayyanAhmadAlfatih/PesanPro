import crypto from "node:crypto";
import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { getOutgoingMessageText, parseOutgoingMessage } from "@/lib/whatsapp-message";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { enqueueMessage } from "@/lib/message-job-service";

/**
 * POST /api/messages/{sessionId}/{jid}/reply
 * Reply to a message with messageId provided in the request body
 * Uses same request format as /send: { message, mentions }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string; jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid } = await params;
        const jid = decodeURIComponent(rawJid);

        const body: unknown = await request.json();
        const messageId = typeof body === "object" && body !== null && "messageId" in body ? body.messageId : undefined;
        const rawMessage = typeof body === "object" && body !== null && "message" in body ? body.message : undefined;
        const mentions = typeof body === "object" && body !== null && "mentions" in body ? body.mentions : undefined;
        const message = parseOutgoingMessage(rawMessage, mentions);

        if (typeof messageId !== "string" || messageId.length === 0) {
            return NextResponse.json({ status: false, message: "messageId is required", error: "messageId is required" }, { status: 400 });
        }

        if (!message) {
            return NextResponse.json({ status: false, message: "message is required", error: "message is required" }, { status: 400 });
        }

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        const text = getOutgoingMessageText(message);
        if (!text.trim()) return NextResponse.json({ status: false, message: "Only text replies are supported by this endpoint", error: "Unsupported reply type" }, { status: 422 });
        const result = await enqueueMessage({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
            operation: "legacy.message.reply",
            idempotencyKey: request.headers.get("idempotency-key") || `legacy-reply-${crypto.randomUUID()}`,
            sessionPublicId: sessionId,
            recipient: jid,
            type: "TEXT",
            text,
            mentions: Array.isArray(mentions) ? mentions.filter((value): value is string => typeof value === "string") : undefined,
            quotedMessageId: messageId,
        });
        return NextResponse.json({ status: true, message: "Reply queued successfully", data: result.job }, { status: 202 });

    } catch (error) {
        const commercialError = commercialErrorResponse(error);
        if (commercialError) return commercialError;
        console.error("Reply message error:", error);
        return NextResponse.json({ status: false, message: "Failed to send reply", error: "Failed to send reply" }, { status: 500 });
    }
}
