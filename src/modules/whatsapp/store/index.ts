import { prisma } from "@/lib/prisma";
import type { WASocket, WAMessage, WAMessageContent } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";
import { onMessageReceived, onMessageSent, dispatchWebhook } from "@/lib/webhook";
import { resolveToPhoneJid, isLidJid, normalizeJid } from "@/lib/jid-utils";
import { isTenantChatJid, readEditedText } from "@/lib/message-event-scope";
import { rememberMessageSecret, getMessageSecret, decryptSecretMessage } from "@/lib/whatsapp-secret-message";
import { maskAutoReplyJid as maskJid } from "@/lib/autoreply-privacy";

import { Server } from "socket.io";
import { logger } from "@/lib/logger";
import { recordMessageDeliveryStatus } from "@/lib/message-queue";
import { isUnsubscribeText, suppressFromInbound } from "@/lib/suppression";
import { ingestAutoReplyMessage } from "./autoreply";
import { MessageStatus, MessageType, Prisma, type BotConfig, type Message } from "@prisma/client";

function getContextStanzaId(value: unknown): string | null {
    if (typeof value !== "object" || value === null || !("contextInfo" in value)) return null;
    const contextInfo = value.contextInfo;
    if (typeof contextInfo !== "object" || contextInfo === null || !("stanzaId" in contextInfo)) return null;
    return typeof contextInfo.stanzaId === "string" ? contextInfo.stanzaId : null;
}

export const bindSessionStore = (sock: WASocket, sessionId: string, io: Server | null) => {
    // First, get the database Session ID (cuid)
    let dbSessionId: string | null = null;

    // Initialize by fetching the session ID
    (async () => {
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { id: true }
        });
        if (session) {
            dbSessionId = session.id;
            logger.info("Store", `Message store initialized for session ${sessionId} (db: ${dbSessionId})`);
        } else {
            logger.error("Store", `Session ${sessionId} not found for message store`);
        }
    })();

    // Handle Messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Process all message types: notify, append, and history sync
        if (type !== 'notify' && type !== 'append') {
            // For history sync, we still want to save messages
            logger.debug("Store", `Received ${messages.length} messages of type: ${type}`);
        }

        // Emit to socket room for real-time frontend updates
        if (type === 'notify' || type === 'append') {
            io?.to(sessionId).emit('message.upsert', { messages, type });
        }

        // Ensure we have the database session ID
        if (!dbSessionId) {
            const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
            if (!session) return;
            dbSessionId = session.id;
        }

        const processedMessages: Message[] = [];

        // Fetch Bot Config for auto-read & welcome message
        const config = await prisma.botConfig.findUnique({
            where: { sessionId: dbSessionId }
        });

        for (const msg of messages) {
            try {
                // Auto Read Logic
                if (type === "notify" && config?.autoRead && !msg.key.fromMe) {
                    await sock.readMessages([msg.key]);
                }

                const savedMessage = await processAndSaveMessage(msg, dbSessionId, sessionId, type === 'notify', sock, config);
                if (savedMessage) {
                    processedMessages.push(savedMessage);
                }
            } catch (error) {
                logger.error("Store", "Error saving message", error);
            }
        }

        // Emit to socket room for real-time frontend updates
        if (processedMessages.length > 0) {
            // Serialize for frontend: convert Date to ISO string
            const serialized = processedMessages.map((m) => ({
                ...m,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp
            }));
            logger.debug("Socket", `Emitting message.update for ${serialized.length} messages in session ${sessionId}`);
            io?.to(sessionId).emit('message.update', serialized);
        }
    });

    // Handle Message History Sync (when connecting for the first time or syncing)
    sock.ev.on('messaging-history.set', async ({ messages, chats, contacts, isLatest }) => {
        logger.info("Store", `History sync: ${messages?.length || 0} messages, ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, latest: ${isLatest}`);

        // Ensure we have the database session ID
        if (!dbSessionId) {
            const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
            if (!session) return;
            dbSessionId = session.id;
        }

        // Save all historical messages
        if (messages && messages.length > 0) {
            logger.info("Store", `Syncing ${messages.length} historical messages...`);
            for (const msg of messages) {
                try {
                    await processAndSaveMessage(msg, dbSessionId, sessionId, false, sock, undefined);
                } catch (error) {
                    logger.error("Store", "Error saving historical message", error);
                }
            }
            logger.success("Store", `Finished syncing ${messages.length} historical messages`);
        }


        // Note: Contacts and Chats are synced by src/modules/whatsapp/store/contacts.ts
        // We only handle messages here to avoid P2002 Unique Constraint Race Conditions.
        logger.debug("Store", `Finished syncing messages`);
    });

    // Enrich conversation contacts only. Do not turn a Baileys address-book
    // snapshot into tenant data: contacts are created from actual chat/message
    // activity elsewhere in this store.
    sock.ev.on('contacts.upsert', async (contacts) => {
        // Ensure we have the database session ID
        if (!dbSessionId) {
            const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
            if (!session) return;
            dbSessionId = session.id;
        }

        for (const c of contacts) {
            try {
                if (!c.id) continue;
                const syncedContact = c as typeof c & { lid?: string; verifiedName?: string };
                await prisma.contact.updateMany({
                    where: { sessionId: dbSessionId, jid: c.id },
                    data: {
                        lid: syncedContact.lid || undefined,
                        name: c.name || undefined,
                        notify: c.notify || undefined,
                        verifiedName: syncedContact.verifiedName || undefined,
                    },
                });

                // contact.update is retired: the Chat inbox that consumed contact
                // names is gone, so the event is no longer published.
            } catch (e) {
                logger.error("Store", "Error saving contact", e);
            }
        }
    });

    // Handle Message Status Updates
    sock.ev.on('messages.update', async (updates) => {
        if (!dbSessionId) return;

        for (const update of updates) {
            try {
                const keyId = update.key?.id;
                if (!keyId) continue;

                // Statuses, broadcast lists and channels reuse the same revoke
                // markers as a real delete. They are not tenant conversations.
                // A missing jid is kept: some update envelopes omit it and the
                // event is still legitimate.
                const remoteJid = update.key?.remoteJid ?? null;
                if (remoteJid && !isTenantChatJid(remoteJid)) continue;

                // Edits and revokes arrive on the update stream. Baileys wraps
                // an edit as update.message.editedMessage.message (key.id is
                // already the target message); revokes use messageStubType.
                const updateMessage = update.update?.message as
                    | (WAMessageContent & {
                        editedMessage?: { message?: WAMessageContent | null } | null;
                        protocolMessage?: {
                            type?: number | null;
                            key?: { id?: string | null } | null;
                            editedMessage?: WAMessageContent | null;
                        } | null;
                    })
                    | null
                    | undefined;
                const editEnvelope = updateMessage?.editedMessage;
                const protocol = updateMessage?.protocolMessage;
                const isEdit = Boolean(editEnvelope?.message) || protocol?.type === 14;
                const isRevoke = protocol?.type === 0 || update.update?.messageStubType === 1;

                if (isEdit || isRevoke) {
                    const targetKeyId = editEnvelope?.message ? keyId : (protocol?.key?.id ?? keyId);
                    const fromMe = update.key?.fromMe ?? false;

                    if (isEdit) {
                        const editContent = editEnvelope?.message ?? protocol?.editedMessage ?? null;
                        const newText = readEditedText(editContent);
                        logger.info("Store", `Edit received on update stream for ${targetKeyId}`);
                        dispatchWebhook(sessionId, "message.edited", {
                            keyId: targetKeyId,
                            newContent: newText,
                            remoteJid,
                            fromMe,
                        }, `message.edited:${keyId}`);
                    } else {
                        await prisma.message.updateMany({
                            where: { sessionId: dbSessionId, keyId: targetKeyId },
                            data: { status: "FAILED" },
                        });
                        dispatchWebhook(sessionId, "message.deleted", {
                            keyId: targetKeyId,
                            remoteJid,
                            fromMe,
                        }, `message.deleted:${targetKeyId}`);
                    }
                    continue;
                }

                const statusMap: Record<number, MessageStatus> = {
                    0: 'PENDING',
                    1: 'SENT',
                    2: 'DELIVERED',
                    3: 'READ',
                    4: 'READ', // Played
                };

                const status = statusMap[update.update?.status || 0] || 'PENDING';

                await prisma.message.updateMany({
                    where: { sessionId: dbSessionId, keyId },
                    data: { status }
                });

                if (status === "SENT" || status === "DELIVERED" || status === "READ") {
                    await recordMessageDeliveryStatus(keyId, status, {
                        remoteJid: update.key?.remoteJid ?? null,
                        status,
                    });
                }

                // One event per (message, status). The queue path owns queued
                // messages; this key makes the store copy deduplicate instead
                // of delivering a second payload shape.
                const statusEventKey = keyId ? `message.status:${keyId}:${status}` : undefined;
                dispatchWebhook(sessionId, "message.status", {
                    messageId: keyId,
                    recipient: update.key?.remoteJid ?? null,
                    keyId,
                    remoteJid: update.key?.remoteJid ?? null,
                    status
                }, statusEventKey);
            } catch (e) {
                logger.error("Store", "Error updating message status", e);
            }
        }
    });

    // Handle Group Updates
    sock.ev.on('groups.update', async (updates) => {
        if (!dbSessionId) return;

        for (const update of updates) {
            try {
                if (!update.id) continue;
                
                // Keep DB in sync
                const updateData: Prisma.GroupUpdateManyMutationInput = {};
                if (update.subject !== undefined) updateData.subject = update.subject;
                if (update.desc !== undefined) updateData.description = update.desc;
                if (update.restrict !== undefined) updateData.restrict = update.restrict;
                if (update.announce !== undefined) updateData.announce = update.announce;
                if (update.owner !== undefined) updateData.ownerJid = update.owner;
                if (update.linkedParent !== undefined) updateData.linkedParentJid = update.linkedParent;
                if (update.isCommunity !== undefined) updateData.isCommunity = update.isCommunity;

                if (Object.keys(updateData).length > 0) {
                    await prisma.group.updateMany({
                        where: { sessionId: dbSessionId, jid: update.id },
                        data: updateData
                    });
                }
                
                // Trigger webhook
                dispatchWebhook(sessionId, "group.update", {
                    jid: update.id,
                    ...update
                });
            } catch (e) {
                logger.error("Store", "Error in groups.update handling", e);
            }
        }
    });

    // Handle Group Participants Update
    sock.ev.on('group-participants.update', async (update) => {
        if (!dbSessionId || !update.id) return;

        try {
            // update.id is the group JID
            // update.participants is array of JIDs
            // update.action is 'add', 'remove', 'promote', 'demote'
            dispatchWebhook(sessionId, "group.participant", {
                jid: update.id,
                action: update.action,
                participants: update.participants
            });
            
            // To properly resync the group participants in DB, it's safer to re-fetch the entire group metadata
            // But we don't await strictly to not block the socket
            sock.groupMetadata(update.id).then(async (g) => {
                await prisma.group.updateMany({
                    where: { sessionId: dbSessionId as string, jid: update.id as string },
                    data: { participants: g.participants as unknown as Prisma.InputJsonValue }
                });
            }).catch(e => {
                 logger.debug("Store", "Failed to refresh group participants metadata", e);
            });
        } catch (e) {
            logger.error("Store", "Error in group-participants.update handling", e);
        }
    });
};

async function processAndSaveMessage(
    msg: WAMessage,
    dbSessionId: string,
    sessionId: string,
    triggerWebhook: boolean,
    sock?: WASocket,
    config?: BotConfig | null
): Promise<Message | null | false> {
    const keyId = msg.key.id;
    const remoteJid = msg.key.remoteJid;
    const fromMe = msg.key.fromMe;
    const pushName = msg.pushName;
    const timestamp = msg.messageTimestamp
        ? new Date((typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : Number(msg.messageTimestamp)) * 1000)
        : new Date();

    // Filter out Protocol & Empty Messages
    if (!msg.message) return false;
    if (!keyId || !remoteJid) return false;
    // Statuses, broadcast lists and channels are not tenant conversations.
    if (!isTenantChatJid(remoteJid)) return false;

    // Keep the per-message secret: a later edit arrives encrypted with it.
    const inboundSecret = (msg.message as WAMessageContent & {
        messageContextInfo?: { messageSecret?: Uint8Array | null } | null;
    }).messageContextInfo?.messageSecret ?? null;
    rememberMessageSecret(sessionId, keyId, inboundSecret);

    // Ignore specific technical message types
    const messageKeys = Object.keys(msg.message);

    // Shape probe: message bodies are never logged, only field names, so an
    // edit we fail to recognise can still be identified from the server log.
    if (!fromMe) {
        logger.info("Store", `Msg keys=${messageKeys.join(",")} stub=${msg.messageStubType ?? "-"} secret=${inboundSecret ? "yes" : "no"} webhook=${triggerWebhook}`);
    }
    if (messageKeys.some((key) => ["editedMessage", "protocolMessage", "reactionMessage", "pollUpdateMessage", "messageContextInfo"].includes(key))) {
        const probe = msg.message as WAMessageContent & {
            editedMessage?: { message?: WAMessageContent | null } | null;
        };
        const inner = probe.editedMessage?.message ?? null;
        logger.info("Store", `Envelope keys=${messageKeys.join(",")} inner=${inner ? Object.keys(inner).join(",") : "-"} webhook=${triggerWebhook}`);
    }

    // An edit from a linked device arrives as a secret-encrypted message: the
    // new text is encrypted with the target message's secret and Baileys does
    // not decode it, so it used to be saved as an empty message.
    const secretEnvelope = (msg.message as WAMessageContent & {
        secretEncryptedMessage?: {
            targetMessageKey?: { id?: string | null } | null;
            encPayload?: Uint8Array | null;
            encIv?: Uint8Array | null;
            secretEncType?: number | null;
        } | null;
    }).secretEncryptedMessage;
    if (secretEnvelope) {
        const targetKeyId = secretEnvelope.targetMessageKey?.id ?? null;
        const secretType = secretEnvelope.secretEncType ?? null;
        logger.info("Store", `Secret message type=${secretType ?? "?"} target=${targetKeyId ?? "-"}`);
        if (secretType === 2 && targetKeyId) {
            const targetSecret = getMessageSecret(sessionId, targetKeyId);
            const ownSecret = (msg.message as WAMessageContent & {
                messageContextInfo?: { messageSecret?: Uint8Array | null } | null;
            }).messageContextInfo?.messageSecret ?? null;
            const secret = targetSecret ?? (ownSecret ? Buffer.from(ownSecret) : null);
            const decrypted = decryptSecretMessage(secretEnvelope.encPayload, secretEnvelope.encIv, secret);
            const newText = readEditedText(decrypted);
            logger.info("Store", `Edit received on secret message for ${targetKeyId} secret=${targetSecret ? "target" : ownSecret ? "own" : "none"} decrypted=${decrypted ? "yes" : "no"}`);
            dispatchWebhook(sessionId, "message.edited", {
                keyId: targetKeyId,
                newContent: newText,
                remoteJid,
                fromMe
            }, `message.edited:${keyId}`);
        }
        return null;
    }

    // An edit can also arrive already unwrapped as msg.message.editedMessage.
    // Baileys normalises that envelope before the upsert, so it never shows up
    // as a protocolMessage here and used to be saved as a brand-new message.
    const editEnvelope = (msg.message as WAMessageContent & {
        editedMessage?: ({ message?: WAMessageContent | null } & WAMessageContent) | null;
    }).editedMessage;
    const editContent = editEnvelope?.message
        ?? (editEnvelope && (editEnvelope.conversation !== undefined || editEnvelope.extendedTextMessage)
            ? (editEnvelope as WAMessageContent)
            : null);
    if (editContent) {
        const newText = readEditedText(editContent);
        logger.info("Store", `Edit received on upsert for ${keyId}`);
        dispatchWebhook(sessionId, "message.edited", {
            keyId,
            newContent: newText,
            remoteJid,
            fromMe
        }, `message.edited:${keyId}`);
        return null;
    }

    // Check for message edit/revoke protocol messages FIRST
    if (messageKeys.includes('protocolMessage')) {
        const pMessage = msg.message.protocolMessage;
        const targetKeyId = pMessage?.key?.id;
        logger.info("Store", `Protocol message type=${pMessage?.type ?? "?"} target=${targetKeyId ?? "-"} webhook=${triggerWebhook}`);

        // Message Edit (Type 14)
        if (pMessage?.type === 14 && targetKeyId) {
            const editContent = pMessage?.editedMessage;
            if (editContent) {
                const newText = readEditedText(editContent);

                // Message text is not persisted, so there is no stored body to
                // rewrite. The edit still reaches the tenant through the webhook.
                // An edit is a protocol event, not a new message, so it is
                // published on every stream (notify and append alike).
                logger.info("Store", `Edit received on protocol message for ${targetKeyId}`);
                dispatchWebhook(sessionId, "message.edited", {
                    keyId: targetKeyId,
                    newContent: newText,
                    remoteJid,
                    fromMe
                }, `message.edited:${keyId}`);
            }
            return null; // Stop processing as new message
        }

        // Message Revoke/Deleted (Type 0)
        if (pMessage?.type === 0 && targetKeyId) {
            // Anti-delete is retired: it existed to keep the text of a message
            // the sender had deleted, and message text is no longer stored at
            // all. Only the delivery state is marked.
            await prisma.message.updateMany({
                where: { sessionId: dbSessionId, keyId: targetKeyId },
                data: { status: "FAILED" }
            });

            // A revoke is a protocol event too: publish it on every stream.
            logger.info("Store", `Delete received on protocol message for ${targetKeyId}`);
            dispatchWebhook(sessionId, "message.deleted", {
                keyId: targetKeyId,
                remoteJid,
                fromMe
            }, `message.deleted:${targetKeyId}`);
            return null;
        }
    }

    const ignoredTypes = [
        'protocolMessage',
        'senderKeyDistributionMessage',
        'reactionMessage', // Optional: User might want reactions, but usually "kosong" means junk
        'keepInChatMessage'
    ];

    // If message only contains ignored types, skip (since edit and revoke handled above)
    if (messageKeys.every(k => ignoredTypes.includes(k))) {
        logger.debug("Store", `Skipping technical message: ${keyId} (${messageKeys.join(', ')})`);
        return null;
    }

    // Check if message already exists to avoid duplicates
    // Baileys 'notify' event can sometimes trigger multiple times or for history
    // Baileys 'notify' event can sometimes trigger multiple times or for history
    const queuedJob = fromMe && keyId
        ? await prisma.messageJob.findUnique({ where: { whatsappMessageId: keyId }, select: { id: true } })
        : null;
    const existingMessage = await prisma.message.findUnique({
        where: { sessionId_keyId: { sessionId: dbSessionId, keyId: keyId! } },
        select: { id: true, status: true, messageJobId: true }
    });

    if (existingMessage) {
        // Message exists! Update status if changed, but DO NOT re-trigger webhooks/bot
        if ((fromMe && existingMessage.status === 'PENDING') || (!existingMessage.messageJobId && queuedJob)) {
            await prisma.message.update({
                where: { id: existingMessage.id },
                data: {
                    ...(fromMe && existingMessage.status === 'PENDING' ? { status: 'SENT' as const } : {}),
                    ...(!existingMessage.messageJobId && queuedJob ? { messageJobId: queuedJob.id } : {}),
                }
            });
        }
        // Return null to indicate "Not New"
        return null;
    }

    // Debug fromMe issue (Keep this for a while)
    if (fromMe === undefined || fromMe === null) {
        logger.warn("Store", `[DEBUG] Message ${keyId} has fromMe=${fromMe}. Key:`, msg.key);
    }

    const messageContent = normalizeMessageContent(msg.message);
    let text = "";
    let messageType: MessageType = MessageType.TEXT;

    // Extract content based on message type
    if (messageContent?.conversation) {
        text = messageContent.conversation;
    } else if (messageContent?.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
    } else if (messageContent?.imageMessage) {
        messageType = MessageType.IMAGE;
        text = messageContent.imageMessage.caption || "";
    } else if (messageContent?.videoMessage) {
        messageType = MessageType.VIDEO;
        text = messageContent.videoMessage.caption || "";
    } else if (messageContent?.audioMessage) {
        messageType = MessageType.AUDIO;
    } else if (messageContent?.documentMessage) {
        messageType = MessageType.DOCUMENT;
        text = messageContent.documentMessage.fileName || "";
    } else if (messageContent?.stickerMessage) {
        messageType = MessageType.STICKER;
    } else if (messageContent?.locationMessage) {
        messageType = MessageType.LOCATION;
        text = `${messageContent.locationMessage.degreesLatitude},${messageContent.locationMessage.degreesLongitude}`;
    } else if (messageContent?.contactMessage) {
        messageType = MessageType.CONTACT;
        text = messageContent.contactMessage.displayName || "";
    }

    // Determine effective participant for groups
    // Determine effective participant for groups with standard logic
    const isGroup = remoteJid.endsWith("@g.us");
    const remoteJidAlt = msg.key.remoteJidAlt; // LID/Phone JID handling
    let senderJid = fromMe ? undefined : (isGroup ? (msg.key.participant || msg.participant) : remoteJid);

    // Prefer remoteJidAlt for DMs if available (matches webhook logic)
    if (!fromMe && !isGroup && remoteJidAlt) {
        senderJid = remoteJidAlt;
    }

    // --- Normalize LID JIDs to @s.whatsapp.net ---
    let normalizedRemoteJid = remoteJid;
    if (isLidJid(remoteJid)) {
        normalizedRemoteJid = await resolveToPhoneJid(remoteJid, dbSessionId, remoteJidAlt);
    }
    if (senderJid && isLidJid(senderJid)) {
        senderJid = await resolveToPhoneJid(senderJid, dbSessionId, remoteJidAlt);
    }


    // Extract contextInfo (quoted message ID)
    let quoteId: string | null = null;
    if (msg.message) {
        for (const inner of Object.values(msg.message)) {
            const stanzaId = getContextStanzaId(inner);
            if (stanzaId) {
                quoteId = stanzaId;
                break;
            }
        }
    }

    try {
        const newMessage = await prisma.message.create({
            data: {
                sessionId: dbSessionId,
                remoteJid: normalizeJid(normalizedRemoteJid),
                senderJid,
                fromMe: fromMe || false,
                keyId,
                pushName,
                type: messageType,
                // Message text is never persisted. The gateway relays it to the
                // webhook and to auto-reply in the same tick, then drops it;
                // only delivery metadata (keyId, status, JIDs, timestamp) stays.
                mediaUrl: null,
                status: fromMe ? "SENT" : "PENDING",
                timestamp,
                quoteId,
                messageJobId: queuedJob?.id,
            }
        });
        
        // Ensure contact exists (Upsert Contact)
        const finalRemoteJid = normalizeJid(normalizedRemoteJid);
        if (remoteJid && !remoteJid.includes('@g.us') && !remoteJid.includes('status@broadcast')) {
            const contactJid = finalRemoteJid; // Use fully normalized JID
            await prisma.contact.upsert({
                where: { sessionId_jid: { sessionId: dbSessionId, jid: contactJid } },
                create: {
                    sessionId: dbSessionId,
                    jid: contactJid,
                    notify: !fromMe ? pushName : undefined,
                    name: !fromMe ? pushName : undefined,
                    remoteJidAlt: remoteJidAlt || undefined,
                    lastActivityAt: timestamp,
                },
                update: {
                    lastActivityAt: timestamp,
                    ...(!fromMe ? {
                        notify: pushName,
                        remoteJidAlt: remoteJidAlt || undefined,
                    } : {}),
                },
            });

            if (!fromMe && isUnsubscribeText(text)) {
                try {
                    await suppressFromInbound(dbSessionId, contactJid, keyId);
                    logger.info("Store", `Recorded broadcast opt-out for ${maskJid(contactJid)}`);
                } catch (error) {
                    // Opt-out persistence must not discard the inbound WhatsApp message.
                    logger.error("Store", `Failed to record broadcast opt-out for ${maskJid(contactJid)}`, error);
                }
            }

            // Welcome message, sent at most once per contact.
            //
            // This used to count stored messages and fire when the count was 1.
            // That stopped being reliable once message retention began purging
            // rows: a contact returning after the retention window looked brand
            // new and received the welcome again. The marker lives on the
            // contact row now, and contacts have no retention.
            //
            // Marking before sending is deliberate. A crash between mark and
            // send costs one missed welcome; the other order costs a duplicate,
            // and a duplicate welcome reads as spam.
            //
            // Groups never reach this branch: only one-to-one chats get a
            // contact row, and a welcome was never meant for a group.
            if (!fromMe && triggerWebhook && config?.welcomeMessage && sock) {
                const contact = await prisma.contact.findUnique({
                    where: { sessionId_jid: { sessionId: dbSessionId, jid: finalRemoteJid } },
                    select: { id: true, welcomedAt: true },
                });

                if (contact && !contact.welcomedAt) {
                    await prisma.contact.update({
                        where: { id: contact.id },
                        data: { welcomedAt: new Date() },
                    });
                    logger.info("Store", `Sending welcome message to ${maskJid(finalRemoteJid)}`);
                    await sock.sendMessage(finalRemoteJid, { text: config.welcomeMessage });
                }
            }
        }

        // Trigger webhook for new messages only (not history sync)
        if (triggerWebhook) {
            if (fromMe) {
                onMessageSent(sessionId, msg).catch(e => logger.error("Webhook", "Error in onMessageSent", e));
            } else {
                onMessageReceived(sessionId, msg).catch(e => logger.error("Webhook", "Error in onMessageReceived", e));
            }

            // Auto-reply consumes the live text here, where it is still in
            // scope. It used to read the stored row back, but message text is
            // no longer persisted. A failure must not fail message persistence.
            await ingestAutoReplyMessage({
                sessionDbId: dbSessionId,
                sourceMessageId: newMessage.keyId,
                text,
                recipientJid: newMessage.remoteJid,
                senderJid: newMessage.senderJid ?? newMessage.remoteJid,
                isGroup: newMessage.remoteJid.endsWith("@g.us"),
                fromMe: newMessage.fromMe,
            }).catch((e) => logger.error("Store", "Auto-reply ingestion failed", e));
        }

        return newMessage;
    } catch (e: unknown) {
        logger.error("Store", "Error saving message query", e);
        throw e;
    }
}
