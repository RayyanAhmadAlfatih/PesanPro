import crypto from "node:crypto";
import { NextResponse, NextRequest } from "next/server";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/error-utils";
import { commercialErrorResponse } from "@/lib/commercial-errors";
import { enqueueMessage } from "@/lib/message-job-service";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string, jid: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId, jid: rawJid } = await params;
        const jid = decodeURIComponent(rawJid);
        
        const body: unknown = await request.json();
        const message = typeof body === "object" && body !== null && "message" in body ? body.message : undefined;
        const rawMentions = typeof body === "object" && body !== null && "mentions" in body ? body.mentions : undefined;
        const rawQuotedMessageId = typeof body === "object" && body !== null && "quotedMessageId" in body ? body.quotedMessageId : undefined;

        const text = typeof message === "string"
            ? message
            : typeof message === "object" && message !== null && "text" in message && typeof message.text === "string"
                ? message.text
                : "";
        if (!text.trim()) {
            return NextResponse.json({ status: false, message: "message is required", error: "message is required" }, { status: 400 });
        }

        if (rawMentions !== undefined && (!Array.isArray(rawMentions) || !rawMentions.every((mention) => typeof mention === "string"))) {
            return NextResponse.json({ status: false, message: "mentions must be an array of strings", error: "mentions must be an array of strings" }, { status: 400 });
        }

        if (rawQuotedMessageId !== undefined && typeof rawQuotedMessageId !== "string") {
            return NextResponse.json({ status: false, message: "quotedMessageId must be a string", error: "quotedMessageId must be a string" }, { status: 400 });
        }

        const mentions = rawMentions as string[] | undefined;
        const quotedMessageId = rawQuotedMessageId as string | undefined;

        // Check if user can access this session
        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden - Cannot access this session", error: "Forbidden - Cannot access this session" }, { status: 403 });
        }

        // Rate limit: 30 messages/min per user (Gate 0 safety)
        const rl = await checkPersistentRateLimit(`send:${user.id}`, 30, 60 * 1000);
        if (!rl.success) {
            return NextResponse.json(
                { status: false, message: "Too many requests, please slow down", error: "Rate limit exceeded" },
                { status: 429, headers: rateLimitHeaders(rl, 30) }
            );
        }

        const result = await enqueueMessage({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId, apiKeyId: user.apiKeyId },
            operation: "legacy.message.send",
            idempotencyKey: request.headers.get("idempotency-key") || `legacy-${crypto.randomUUID()}`,
            sessionPublicId: sessionId,
            recipient: jid,
            type: "TEXT",
            text,
            mentions,
            quotedMessageId,
        });

        return NextResponse.json({ status: true, message: "Message queued successfully", data: result.job }, { status: 202 });
    } catch (error: unknown) {
        const commercialError = commercialErrorResponse(error);
        if (commercialError) return commercialError;
        console.error("Send message error:", error);
        const errorMsg = getErrorMessage(error) || "Failed to send message";
        return NextResponse.json({ status: false, message: errorMsg, error: errorMsg }, { status: 500 });
    }
}
