import { prisma } from "@/lib/prisma";
import { normalizeJid } from "@/lib/jid-utils";
import { waManager } from "@/modules/whatsapp/manager";
import { onMessageSent } from "@/lib/webhook";
import { safeFetchBuffer } from "@/lib/ssrf";
import Sticker from "@/lib/sticker";
import { Prisma } from "@prisma/client";
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage, WAMessageContent } from "@whiskeysockets/baileys";
import { buildQuotedMessage } from "@/lib/whatsapp-message";

type ChatListItem = {
    jid: string;
    name: string | null;
    notify: string | null;
    profilePic: string | null;
    lastMessage: {
        content: string | null;
        timestamp: string;
        type: string;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUrl(value: unknown): string | null {
    return isRecord(value) && typeof value.url === "string" ? value.url : null;
}

function getString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function buildWebhookContent(payload: Record<string, unknown>): WAMessageContent {
    const caption = getString(payload.caption);
    if (payload.image) return { imageMessage: { caption, mimetype: getString(payload.mimetype) || "image/jpeg" } };
    if (payload.video) return { videoMessage: { caption, mimetype: getString(payload.mimetype) || "video/mp4" } };
    if (payload.audio) return { audioMessage: { mimetype: payload.ptt ? "audio/ogg; codecs=opus" : "audio/mp4" } };
    if (payload.document) return { documentMessage: { caption, fileName: getString(payload.fileName) || "document", mimetype: getString(payload.mimetype) || "application/octet-stream" } };
    if (payload.sticker) return { stickerMessage: {} };
    return { conversation: getString(payload.text) || caption };
}

export class ChatService {
    /**
     * Get active chats list for a session with last message preview.
     * Cursor-based pagination — `before` is ISO timestamp of last seen chat.
     * Returns chats with last message timestamp < before (older).
     */
    static async getChatsList(
        dbSessionId: string,
        limit = 50,
        before?: string,
        search?: string
    ) {
        // 1. Get latest message per remoteJid with cursor pagination
        // Uses m1.timestamp < before (when provided) to load older chats
        // Build params: [dbSessionId, dbSessionId, (before?), limit]
        const beforeFilter = before ? Prisma.sql`AND m1.timestamp < ${new Date(before)}` : Prisma.empty;
        const rawLastMessages = await prisma.$queryRaw<Array<{
            remoteJid: string;
            content: string | null;
            timestamp: Date;
            type: string;
        }>>(Prisma.sql`
            SELECT m1.remoteJid, m1.content, m1.timestamp, m1.type
            FROM \`Message\` m1
            INNER JOIN (
                SELECT remoteJid, MAX(timestamp) as max_ts
                FROM \`Message\`
                WHERE sessionId = ${dbSessionId}
                GROUP BY remoteJid
            ) m2 ON m1.remoteJid = m2.remoteJid AND m1.timestamp = m2.max_ts
            WHERE m1.sessionId = ${dbSessionId}
            ${beforeFilter}
            ORDER BY m1.timestamp DESC
            LIMIT ${limit}
        `);

        // Fast return if no messages
        if (rawLastMessages.length === 0) return [];

        // 2. Batch fetch contacts & groups ONLY for JIDs that have messages
        const jids = rawLastMessages.map(m => m.remoteJid);
        const [contacts, groups] = await Promise.all([
            prisma.contact.findMany({
                where: { sessionId: dbSessionId, jid: { in: jids } },
                select: { jid: true, name: true, notify: true, profilePic: true }
            }),
            prisma.group.findMany({
                where: { sessionId: dbSessionId, jid: { in: jids } },
                select: { jid: true, subject: true }
            })
        ]);

        // Build lookup map
        const infoMap = new Map<string, { name: string | null; notify: string | null; profilePic: string | null }>();
        contacts.forEach(c => infoMap.set(c.jid, { name: c.name, notify: c.notify, profilePic: c.profilePic }));
        groups.forEach(g => infoMap.set(g.jid, { name: g.subject, notify: g.subject, profilePic: null }));

        // 3. Build result array (already sorted by SQL DESC)
        const result: ChatListItem[] = [];
        const seenJids = new Set<string>();
        for (const msg of rawLastMessages) {
            if (seenJids.has(msg.remoteJid)) continue;
            seenJids.add(msg.remoteJid);

            const info = infoMap.get(msg.remoteJid);
            result.push({
                jid: msg.remoteJid,
                name: info?.name || null,
                notify: info?.notify || null,
                profilePic: info?.profilePic || null,
                lastMessage: {
                    content: msg.content,
                    timestamp: msg.timestamp instanceof Date
                        ? msg.timestamp.toISOString()
                        : String(msg.timestamp),
                    type: msg.type
                }
            });
        }

        // 4. Apply in-memory search filter if needed
        if (search && search.trim()) {
            const q = search.toLowerCase();
            return result.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.notify || '').toLowerCase().includes(q) ||
                c.jid.toLowerCase().includes(q)
            );
        }

        return result;
    }

    /**
     * Get messages for a specific chat with cursor pagination (infinite scroll).
     * @param before ISO timestamp — load messages older than this
     * @param limit max messages to return
     */
    static async getMessages(
        dbSessionId: string,
        jid: string,
        limit = 50,
        before?: string
    ) {
        const normalizedJid = normalizeJid(jid);

        // Find contact variations (LID, alt JIDs)
        const contact = await prisma.contact.findFirst({
            where: {
                sessionId: dbSessionId,
                OR: [{ jid }, { lid: jid }, { remoteJidAlt: jid }, { jid: normalizedJid }]
            },
            select: { jid: true, lid: true, remoteJidAlt: true }
        });

        const queryJids = new Set([jid, normalizedJid]);
        if (contact) {
            if (contact.jid) queryJids.add(contact.jid);
            if (contact.lid) queryJids.add(contact.lid);
            if (contact.remoteJidAlt) queryJids.add(contact.remoteJidAlt);
        }

        const where: Prisma.MessageWhereInput = {
            sessionId: dbSessionId,
            remoteJid: { in: Array.from(queryJids) }
        };

        // Cursor-based: load older messages before this timestamp
        if (before) {
            where.timestamp = { lt: new Date(before) };
        }

        const messages = await prisma.message.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit + 1 // fetch 1 extra to know if there's more
        });

        const hasMore = messages.length > limit;
        if (hasMore) messages.pop();

        // Fetch quoted messages
        const quoteIds = messages.map(m => m.quoteId).filter((id): id is string => !!id);
        const quotedMessagesMap = new Map<string, { content: string | null; fromMe: boolean; senderJid: string | null; pushName: string | null }>();
        if (quoteIds.length > 0) {
            try {
                const quotedMsgs = await prisma.message.findMany({
                    where: { sessionId: dbSessionId, keyId: { in: quoteIds } },
                    select: { keyId: true, content: true, fromMe: true, senderJid: true, pushName: true }
                });
                quotedMsgs.forEach(qm => {
                    quotedMessagesMap.set(qm.keyId, {
                        content: qm.content,
                        fromMe: qm.fromMe,
                        senderJid: qm.senderJid,
                        pushName: qm.pushName
                    });
                });
            } catch (e) {
                console.error("Failed to batch load quoted messages:", e);
            }
        }

        const messagesWithQuote = messages.map((m) => {
            const quoted = m.quoteId ? quotedMessagesMap.get(m.quoteId) : undefined;
            return {
                ...m,
                quoted: quoted ? {
                    keyId: m.quoteId,
                    content: quoted.content,
                    fromMe: quoted.fromMe,
                    senderJid: quoted.senderJid,
                    pushName: quoted.pushName
                } : null
            };
        });

        // Return chronological order (oldest first)
        return {
            messages: messagesWithQuote.reverse(),
            hasMore
        };
    }

    static async sendTextMessage(sessionId: string, jid: string, messagePayload: unknown, mentions?: string[], quotedMessageId?: string) {
        const instance = waManager.getInstance(sessionId);
        if (!instance || !instance.socket) {
            throw new Error("WhatsApp session is disconnected or not found");
        }

        // Handle quoted/reply message
        if (!isRecord(messagePayload)) {
            throw new Error("Invalid message payload");
        }

        const quotedOption = quotedMessageId ? await buildQuotedMessage(sessionId, jid, quotedMessageId) : undefined;
        let msgPayload: Record<string, unknown> = { ...messagePayload };

        // Normalize "text" to "caption" if a media message is sent with "text"
        if (msgPayload.text && (msgPayload.image || msgPayload.video || msgPayload.document || msgPayload.audio)) {
            if (!msgPayload.caption) {
                msgPayload.caption = msgPayload.text;
            }
            delete msgPayload.text;
        }

        const stickerUrl = typeof msgPayload.sticker === "string" ? msgPayload.sticker : getUrl(msgPayload.sticker);
        if (stickerUrl) {
            const stickerOptions = isRecord(msgPayload.sticker) ? msgPayload.sticker : {};
            try {
                const buffer = await safeFetchBuffer(stickerUrl, { timeoutMs: 10000, maxBytes: 10 * 1024 * 1024 });
                const sticker = new Sticker(buffer, {
                    pack: getString(stickerOptions.pack) || "PesanPro Bot",
                    author: getString(stickerOptions.author) || "PesanPro",
                    type: "full",
                    quality: 50
                });
                msgPayload = { sticker: await sticker.toBuffer() };
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Failed to generate sticker from URL: ${msg}`);
            }
        }

        const imageUrl = getUrl(msgPayload.image);
        if (imageUrl) {
            try {
                const buffer = await safeFetchBuffer(imageUrl, { timeoutMs: 10000, maxBytes: 10 * 1024 * 1024 });
                msgPayload.image = buffer;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Failed to fetch image from URL: ${msg}`);
            }
        }

        const videoUrl = getUrl(msgPayload.video);
        if (videoUrl) {
            try {
                const buffer = await safeFetchBuffer(videoUrl, { timeoutMs: 15000, maxBytes: 20 * 1024 * 1024 });
                msgPayload.video = buffer;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Failed to fetch video from URL: ${msg}`);
            }
        }

        const documentUrl = getUrl(msgPayload.document);
        if (documentUrl) {
            try {
                const buffer = await safeFetchBuffer(documentUrl, { timeoutMs: 15000, maxBytes: 20 * 1024 * 1024 });
                msgPayload.document = buffer;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Failed to fetch document from URL: ${msg}`);
            }
        }

        const audioUrl = getUrl(msgPayload.audio);
        if (audioUrl) {
            try {
                const buffer = await safeFetchBuffer(audioUrl, { timeoutMs: 15000, maxBytes: 10 * 1024 * 1024 });
                msgPayload.audio = buffer;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`Failed to fetch audio from URL: ${msg}`);
            }
        }

        if (msgPayload.text && mentions && Array.isArray(mentions)) {
            msgPayload.mentions = mentions;
        }

        const options: MiscMessageGenerationOptions = quotedOption ? { quoted: quotedOption } : {};

        const sendResult = await instance.socket.sendMessage(jid, msgPayload as AnyMessageContent, options);

        // Fire webhook for sent message (non-blocking)
        try {
            const webhookMsg: WAMessage = {
                key: sendResult?.key ?? { remoteJid: jid, fromMe: true },
                message: buildWebhookContent(msgPayload),
                messageTimestamp: Math.floor(Date.now() / 1000)
            };

            onMessageSent(sessionId, webhookMsg).catch(e => console.error("Webhook error:", e));
        } catch (e) {
            // Non-blocking — webhook failure shouldn't break message send
        }

        return sendResult;
    }

    /**
     * Send a media message locally from a buffer.
     */
    static async sendMediaMessage(
        sessionId: string,
        jid: string,
        buffer: Buffer,
        type: string,
        mimetype: string,
        fileName: string,
        caption: string
    ) {
        const instance = waManager.getInstance(sessionId);
        if (!instance || !instance.socket) {
            throw new Error("WhatsApp session is disconnected or not found");
        }

        const messageOptions = { caption: caption || undefined, mimetype };
        let content: AnyMessageContent;

        if (type === 'image') {
            content = { image: buffer, ...messageOptions };
        } else if (type === 'video') {
            content = { video: buffer, ...messageOptions };
        } else if (type === 'audio') {
            content = { audio: buffer, mimetype: 'audio/mp4', ptt: false };
        } else if (type === 'voice') {
            content = { audio: buffer, mimetype: 'audio/mp4', ptt: true };
        } else if (type === 'document') {
            content = { document: buffer, fileName, ...messageOptions };
        } else if (type === 'sticker') {
            const sticker = new Sticker(buffer, {
                pack: "PesanPro Bot",
                author: "PesanPro",
                type: "full",
                quality: 50
            });
            content = { sticker: await sticker.toBuffer() };
        } else {
            content = { document: buffer, fileName, ...messageOptions };
        }

        const sendResult = await instance.socket.sendMessage(jid, content);

        // Fire webhook for sent media message (non-blocking)
        try {
            let webhookContent: WAMessageContent = { conversation: caption || "" };
            const webhookMsg: WAMessage = {
                key: sendResult?.key ?? { remoteJid: jid, fromMe: true },
                message: webhookContent,
                messageTimestamp: Math.floor(Date.now() / 1000)
            };

            // Map media type to proper message structure for webhook
            if (type === 'image') {
                webhookContent = { imageMessage: { caption: caption || "", mimetype } };
            } else if (type === 'video') {
                webhookContent = { videoMessage: { caption: caption || "", mimetype } };
            } else if (type === 'audio' || type === 'voice') {
                webhookContent = { audioMessage: { mimetype: "audio/mp4", ptt: type === "voice" } };
            } else if (type === 'document') {
                webhookContent = { documentMessage: { caption: caption || "", fileName, mimetype } };
            } else if (type === 'sticker') {
                webhookContent = { stickerMessage: {} };
            }
            webhookMsg.message = webhookContent;

            onMessageSent(sessionId, webhookMsg).catch(e => console.error("Webhook error:", e));
        } catch (e) {
            // Non-blocking
        }

        return sendResult;
    }
}
