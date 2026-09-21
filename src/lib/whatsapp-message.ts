import type { AnyMessageContent, WAMessage, WAMessageContent, WAMessageKey } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOutgoingMessage(value: unknown, mentions?: unknown): AnyMessageContent | null {
    if (!isRecord(value) || Object.keys(value).length === 0) {
        return null;
    }

    const message = { ...value };
    if (typeof message.text === "string" && Array.isArray(mentions) && mentions.every((mention) => typeof mention === "string")) {
        message.mentions = mentions;
    }

    return message as AnyMessageContent;
}

export function getOutgoingMessageText(message: AnyMessageContent): string {
    if ("text" in message && typeof message.text === "string") return message.text;
    if ("caption" in message && typeof message.caption === "string") return message.caption;
    return "";
}

export async function buildQuotedMessage(sessionId: string, jid: string, messageId: string): Promise<WAMessage> {
    const key: WAMessageKey = {
        remoteJid: jid,
        fromMe: false,
        id: messageId,
    };
    let message: WAMessageContent = { extendedTextMessage: { text: "" } };
    let participant: string | undefined;
    let messageTimestamp: number | undefined;
    let pushName: string | undefined;

    try {
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true },
        });

        if (!session) return { key, message };

        const originalMessage = await prisma.message.findUnique({
            where: {
                sessionId_keyId: {
                    sessionId: session.id,
                    keyId: messageId,
                },
            },
        });

        if (!originalMessage) return { key, message };

        key.fromMe = originalMessage.fromMe;
        if (originalMessage.timestamp) {
            messageTimestamp = Math.floor(originalMessage.timestamp.getTime() / 1000);
        }
        pushName = originalMessage.pushName ?? undefined;

        if (jid.endsWith("@g.us") && originalMessage.senderJid) {
            participant = originalMessage.senderJid;
            if (participant.includes("@lid")) {
                const contact = await prisma.contact.findUnique({
                    where: {
                        sessionId_jid: { sessionId: session.id, jid: participant },
                    },
                    select: { remoteJidAlt: true },
                });
                participant = contact?.remoteJidAlt ?? participant;
            }
            key.participant = participant;
        }

        switch (originalMessage.type) {
            case "TEXT":
                message = { extendedTextMessage: { text: originalMessage.content ?? "" } };
                break;
            case "IMAGE":
                message = { imageMessage: { caption: originalMessage.content ?? "" } };
                break;
            case "VIDEO":
                message = { videoMessage: { caption: originalMessage.content ?? "" } };
                break;
            case "DOCUMENT":
                message = { documentMessage: { fileName: originalMessage.content ?? "Document" } };
                break;
            case "AUDIO":
                message = { audioMessage: {} };
                break;
            case "STICKER":
                message = { stickerMessage: {} };
                break;
            case "CONTACT":
                message = { contactMessage: { displayName: originalMessage.content ?? "" } };
                break;
            case "LOCATION":
                message = { locationMessage: {} };
                break;
        }
    } catch (error: unknown) {
        console.warn("Could not fetch original message for quoted reply context:", error);
    }

    return { key, message, participant, messageTimestamp, pushName };
}
