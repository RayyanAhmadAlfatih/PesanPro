"use server";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ChatService } from "@/modules/whatsapp/chat.service";
import { getAuthenticatedUserForAction } from "@/lib/server-action-auth";
import { canAccessSession } from "@/lib/api-auth";
import { getErrorMessage } from "@/lib/error-utils";
import { enqueueMessage } from "@/lib/message-job-service";
import { storePrivateMedia } from "@/lib/private-media";

const CHAT_PAGE_SIZE = parseInt(process.env.NEXT_PUBLIC_CHAT_PAGE_SIZE || "50", 10);

// Fetch chat list with cursor-based pagination & search
export async function getChatsStatus(
    sessionId: string,
    limit = CHAT_PAGE_SIZE,
    before?: string,
    search?: string
) {
    const user = await getAuthenticatedUserForAction();
    if (!user) throw new Error("Unauthorized");

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) throw new Error("Forbidden");

    const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { id: true }
    });

    if (!session) throw new Error("Session not found");

    return await ChatService.getChatsList(session.id, limit, before, search);
}

// Fetch messages for a specific chat with cursor pagination
export async function getChatMessages(
    sessionId: string,
    jid: string,
    limit = 50,
    before?: string
) {
    const user = await getAuthenticatedUserForAction();
    if (!user) throw new Error("Unauthorized");

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) throw new Error("Forbidden");

    const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { id: true }
    });

    if (!session) throw new Error("Session not found");

    const { messages, hasMore } = await ChatService.getMessages(session.id, jid, limit, before);

    return {
        messages: messages.map((msg) => ({
            ...msg,
            content: msg.content ?? "",
            pushName: msg.pushName ?? undefined,
            mediaUrl: msg.mediaUrl ?? undefined,
            quoted: msg.quoted
                ? { ...msg.quoted, keyId: msg.quoted.keyId ?? "" }
                : null,
            timestamp: msg.timestamp instanceof Date
                ? msg.timestamp.toISOString()
                : String(msg.timestamp)
        })),
        hasMore
    };
}

// Send a basic text message
export async function sendChatMessage(sessionId: string, jid: string, text: string, quotedMessageId?: string) {
    const user = await getAuthenticatedUserForAction();
    if (!user) throw new Error("Unauthorized");

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) throw new Error("Forbidden");

    try {
        const result = await enqueueMessage({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId },
            operation: "dashboard.chat.text",
            idempotencyKey: `chat-${crypto.randomUUID()}`,
            sessionPublicId: sessionId,
            recipient: jid,
            type: "TEXT",
            text,
            quotedMessageId,
        });
        return { success: true, job: result.job };
    } catch (error: unknown) {
        throw new Error(`Failed to send message: ${getErrorMessage(error) || "Unknown error"}`);
    }
}

// Upload and Send Media
export async function sendMediaMessage(formData: FormData) {
    const user = await getAuthenticatedUserForAction();
    if (!user) throw new Error("Unauthorized");

    const sessionId = formData.get("sessionId");
    const jid = formData.get("jid");
    const file = formData.get("file");
    const type = formData.get("type");
    const rawCaption = formData.get("caption");
    const caption = typeof rawCaption === "string" ? rawCaption : "";

    if (typeof sessionId !== "string" || typeof jid !== "string" || !(file instanceof File) || typeof type !== "string") {
        throw new Error("Missing required fields");
    }

    const canAccess = await canAccessSession(user.id, user.role, sessionId);
    if (!canAccess) throw new Error("Forbidden");

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const typeMap = { image: "IMAGE", video: "VIDEO", audio: "AUDIO", document: "DOCUMENT" } as const;
        const messageType = typeMap[type as keyof typeof typeMap];
        if (!messageType) throw new Error("Unsupported media type");
        const media = await storePrivateMedia({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId },
            sessionPublicId: sessionId,
            originalName: file.name,
            declaredMimeType: file.type,
            buffer,
        });
        const result = await enqueueMessage({
            actor: { id: user.id, role: user.role, ownerId: user.ownerId },
            operation: "dashboard.chat.media",
            idempotencyKey: `chat-media-${crypto.randomUUID()}`,
            sessionPublicId: sessionId,
            recipient: jid,
            type: messageType,
            mediaId: media.id,
            caption,
        });
        return { success: true, job: result.job };
    } catch (error: unknown) {
        console.error("Media send error:", error);
        throw new Error(`Failed to send media: ${getErrorMessage(error) || "Unknown error"}`);
    }
}
