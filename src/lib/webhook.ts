import { prisma } from "./prisma";
import { normalizeMessageContent, type WAMessage, type WAMessageContent } from "@whiskeysockets/baileys";
import { resolveToPhoneJidBySessionId as resolveToPhoneJid } from "./jid-utils";
import { logger } from "./logger";
import { waManager } from "@/modules/whatsapp/manager";
import { Prisma } from "@prisma/client";
import { publishWebhookEvent } from "./webhook-outbox";
import type { WebhookEventType } from "./webhook-contract";

export type { WebhookEventType } from "./webhook-contract";

type GroupParticipant = Prisma.JsonObject & { id: string };

type QuotedWebhookMessage = {
    key: {
        remoteJid: string | null;
        participant: string | null;
        fromMe: boolean;
        id: string | null;
    };
    type: string;
    content: string;
    caption?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGroupParticipant(value: Prisma.JsonValue): value is GroupParticipant {
    return isRecord(value) && typeof value.id === "string";
}

export async function dispatchWebhook(
    sessionId: string,
    event: WebhookEventType,
    data: unknown
) {
    try {
        await publishWebhookEvent(sessionId, event, data);
    } catch (error) {
        logger.error("Webhook", "Failed to persist webhook event:", error);
    }
}

/**
 * Get PesanPro's own clean phone JID for a session
 * Strips device suffix (e.g. :47@s.whatsapp.net → @s.whatsapp.net)
 */
function getOwnJid(sessionId: string): string | null {
    try {
        const instance = waManager.getInstance(sessionId);
        const jid = instance?.socket?.user?.id || null;
        if (!jid) return null;
        // Strip device suffix (e.g. :47) — Baileys includes device ID in user.id
        return jid.replace(/:\d+(?=@)/g, '');
    } catch {
        return null;
    }
}

export async function onMessageReceived(sessionId: string, message: WAMessage) {
    // Re-calculate fields to match store logic EXACTLY
    const remoteJid = message.key?.remoteJid || "";
    const fromMe = message.key?.fromMe || false;
    const isGroup = remoteJid.endsWith("@g.us");
    const participant = isGroup ? (message.key?.participant || message.participant) : undefined;

    // Extract Alt JID (e.g. Phone Number JID when remoteJid is LID)
    const remoteJidAlt = message.key?.remoteJidAlt || null;

    // --- Consistent JID Normalization ---
    // Always prefer @s.whatsapp.net format over @lid
    const normalizedFrom = await resolveToPhoneJid(remoteJid, sessionId, remoteJidAlt);

    // "sender" is who sent it. In DM: remoteJid. In Group: participant.
    const senderJid: string = isGroup ? (participant || "") : remoteJid;
    const normalizedSender = await resolveToPhoneJid(senderJid, sessionId);
    let sender: string | GroupParticipant = normalizedSender;

    // Enrich Participant Data if Group
    let participantDetail: string | GroupParticipant = await resolveToPhoneJid(participant || "", sessionId);

    if (isGroup && typeof sender === 'string') {
        try {
            const session = await prisma.session.findUnique({
                where: { sessionId },
                select: { id: true }
            });

            if (session) {
                const group = await prisma.group.findUnique({
                    where: {
                        sessionId_jid: {
                            sessionId: session.id,
                            jid: remoteJid
                        }
                    },
                    select: { participants: true }
                });

                if (group && group.participants) {
                    const parts = Array.isArray(group.participants) ? group.participants : [];
                    const found = parts.find((part): part is GroupParticipant => isGroupParticipant(part) && (part.id === senderJid || part.id === participant || part.id === normalizedSender));
                    if (found) {
                        sender = found;
                        participantDetail = found;
                    }
                }
            }
        } catch (e) {
            logger.error("Store", "Failed to enrich participant", e);
        }
    }

    const normalized = extractMessageContent(message);
    const quoted = await extractQuotedMessageAsync(message);

    dispatchWebhook(sessionId, "message.received", {
        key: {
            id: message.key?.id,
            remoteJid: normalizedFrom,
            fromMe: fromMe,
            participant: participantDetail
        },
        pushName: message.pushName,
        messageTimestamp: message.messageTimestamp,

        // Simplified Fields — always @s.whatsapp.net format
        from: normalizedFrom,       // Sender — who sent it
        receiver: getOwnJid(sessionId), // PesanPro own number
        sender: sender,             // Who Sent It (normalized JID or enriched Object)
        isGroup: isGroup,           // Boolean
        chatType: getChatType(remoteJid), // PERSONAL | GROUP | STATUS | NEWSLETTER

        // Message Content
        type: normalized.type,
        content: normalized.content,
        caption: normalized.caption,
        quoted: quoted,

    });
}

/**
 * Helper to dispatch message sent event
 */
export async function onMessageSent(sessionId: string, message: WAMessage) {
    const normalized = extractMessageContent(message);
    const quoted = await extractQuotedMessageAsync(message);
    const remoteJid = message.key?.remoteJid || "";
    const isGroup = remoteJid.endsWith("@g.us");
    const remoteJidAlt = message.key?.remoteJidAlt || null;

    // --- Consistent JID Normalization (same as onMessageReceived) ---
    const normalizedFrom = await resolveToPhoneJid(remoteJid, sessionId, remoteJidAlt);

    // For sent messages, sender is "ME" (self)
    // But we still normalize the participant JID if in a group
    const rawSender = message.key?.participant || (message.key?.fromMe ? "ME" : remoteJid);
    const sender = rawSender === "ME" ? "ME" : await resolveToPhoneJid(rawSender, sessionId);

    dispatchWebhook(sessionId, "message.sent", {
        key: {
            id: message.key?.id,
            remoteJid: normalizedFrom,
            fromMe: message.key?.fromMe || true,
            participant: isGroup ? sender : undefined
        },

        // Simplified Fields — always @s.whatsapp.net format
        from: getOwnJid(sessionId), // PesanPro own number
        receiver: normalizedFrom,   // Recipient
        sender: sender,             // "ME" or normalized JID
        isGroup: isGroup,           // Boolean
        chatType: getChatType(remoteJid), // PERSONAL | GROUP | STATUS | NEWSLETTER

        type: normalized.type,
        content: normalized.content,
        caption: normalized.caption,
        quoted: quoted,

        timestamp: Date.now()
    });
}

/**
 * Helper to fire message.sent webhook after any sendMessage call
 * Constructs minimal WAMessage-like object from send result + payload info
 */
export async function fireSentWebhook(
    sessionId: string,
    jid: string,
    payload: { type?: string; text?: string; caption?: string; fileName?: string; mimetype?: string; ptt?: boolean },
    sendResult: WAMessage | undefined
) {
    try {
        // Handle WAMessage vs MessageKey — Baileys can return either
        const key = sendResult?.key;
        let messageContent: WAMessageContent = { conversation: payload.text || payload.caption || "" };
        const webhookMsg: WAMessage = {
            key: {
                id: key?.id,
                remoteJid: key?.remoteJid || jid,
                fromMe: true
            },
            message: messageContent,
            messageTimestamp: Math.floor(Date.now() / 1000)
        };

        if (payload.type === 'image') {
            messageContent = { imageMessage: { caption: payload.caption || "", mimetype: payload.mimetype || "image/jpeg" } };
        } else if (payload.type === 'video') {
            messageContent = { videoMessage: { caption: payload.caption || "", mimetype: payload.mimetype || "video/mp4" } };
        } else if (payload.type === 'audio' || payload.type === 'voice') {
            messageContent = { audioMessage: { mimetype: payload.mimetype || "audio/mp4", ptt: payload.type === "voice" } };
        } else if (payload.type === 'document') {
            messageContent = { documentMessage: { caption: payload.caption || "", fileName: payload.fileName || "document", mimetype: payload.mimetype || "application/octet-stream" } };
        } else if (payload.type === 'sticker') {
            messageContent = { stickerMessage: {} };
        }
        webhookMsg.message = messageContent;

        await onMessageSent(sessionId, webhookMsg);
    } catch {
        // Non-blocking
    }
}

/**
 * Determine chat type from JID
 */
function getChatType(jid: string): "PERSONAL" | "GROUP" | "STATUS" | "NEWSLETTER" | "UNKNOWN" {
    if (!jid) return "UNKNOWN";
    if (jid.endsWith("@g.us")) return "GROUP";
    if (jid.endsWith("@s.whatsapp.net")) return "PERSONAL";
    if (jid.endsWith("@lid")) return "PERSONAL"; // LID is also a personal chat
    if (jid === "status@broadcast") return "STATUS";
    if (jid.endsWith("@newsletter")) return "NEWSLETTER";
    return "UNKNOWN";
}


/**
 * Helper to dispatch connection update event
 */
export function onConnectionUpdate(sessionId: string, status: string, qr?: string) {
    dispatchWebhook(sessionId, "connection.update", {
        status,
        qr: qr || null
    });
}

/**
 * Extract content and type from Baileys message
 */
function extractMessageContent(msg: { message?: WAMessageContent | null }): { type: string, content: string, caption?: string } {
    const messageContent = normalizeMessageContent(msg.message);
    let text = "";
    let caption = undefined;
    let messageType = "TEXT";

    if (!messageContent) return { type: "UNKNOWN", content: "" };

    if (messageContent.conversation) {
        text = messageContent.conversation;
    } else if (messageContent.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
    } else if (messageContent.imageMessage) {
        messageType = "IMAGE";
        caption = messageContent.imageMessage.caption || "";
        text = caption; // Content often used as text display
    } else if (messageContent.videoMessage) {
        messageType = "VIDEO";
        caption = messageContent.videoMessage.caption || "";
        text = caption;
    } else if (messageContent.audioMessage) {
        messageType = "AUDIO";
    } else if (messageContent.documentMessage) {
        messageType = "DOCUMENT";
        text = messageContent.documentMessage.fileName || "";
        caption = messageContent.documentMessage.caption || "";
    } else if (messageContent.stickerMessage) {
        messageType = "STICKER";
    } else if (messageContent.locationMessage) {
        messageType = "LOCATION";
        text = `${messageContent.locationMessage.degreesLatitude},${messageContent.locationMessage.degreesLongitude}`;
    } else if (messageContent.contactMessage) {
        messageType = "CONTACT";
        text = messageContent.contactMessage.displayName || "";
    }

    return { type: messageType, content: text, caption };
}



/**
 * Extract Quoted Message recursively.
 *
 * Media is intentionally not resolved: PesanPro no longer stores WhatsApp
 * message media, so a quoted message carries metadata only.
 */
async function extractQuotedMessageAsync(msg: { message?: WAMessageContent | null }): Promise<QuotedWebhookMessage | null> {
    const messageContent = normalizeMessageContent(msg.message);
    if (!messageContent) return null;

    // Check for contextInfo in common message types
    const contextInfo = messageContent.extendedTextMessage?.contextInfo
        ?? messageContent.imageMessage?.contextInfo
        ?? messageContent.videoMessage?.contextInfo
        ?? messageContent.audioMessage?.contextInfo
        ?? messageContent.stickerMessage?.contextInfo
        ?? messageContent.documentMessage?.contextInfo
        ?? messageContent.contactMessage?.contextInfo
        ?? messageContent.locationMessage?.contextInfo;

    if (contextInfo && contextInfo.quotedMessage) {
        const quotedMsg = contextInfo.quotedMessage;
        const normalized = extractMessageContent({ message: quotedMsg });

        return {
            key: {
                remoteJid: contextInfo.remoteJid || null, // Group JID
                participant: contextInfo.participant || null, // Sender JID
                fromMe: contextInfo.participant === undefined, // Not reliable, better check participant
                id: contextInfo.stanzaId || null
            },
            type: normalized.type,
            content: normalized.content, // Text or Caption
            caption: normalized.caption,
        };
    }

    return null;
}
