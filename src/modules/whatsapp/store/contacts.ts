import { prisma } from "@/lib/prisma";
import type { WASocket } from "@whiskeysockets/baileys";
import { logger } from "@/lib/logger";

/**
 * Keep only contacts that are relevant to a conversation.
 *
 * PesanPro intentionally does not import the device's complete address book.
 * Chat history and live message activity create the minimal contact records
 * needed by Chat, labels, consent, campaigns, and JID resolution. Contact
 * update events only enrich records that already exist.
 */
export function bindContactSync(sock: WASocket, sessionId: string) {
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
            logger.info("Store", `Contact sync initialized for session ${sessionId} (db: ${dbSessionId})`);
        } else {
            logger.error("Store", `Session ${sessionId} not found for contact sync`);
        }
    })();

    // Handle contacts.update event (fires when contacts are updated)
    sock.ev.on('contacts.update', async (updates) => {
        if (!dbSessionId) {
            const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
            if (!session) return;
            dbSessionId = session.id;
        }
        
        logger.debug("Store", `Received ${updates.length} contact updates for session ${sessionId}`);
        for (const update of updates) {
            try {
                if (!update.id) continue;
                
                await prisma.contact.updateMany({
                    where: { sessionId: dbSessionId, jid: update.id },
                    data: {
                        name: update.name || undefined,
                        notify: update.notify || undefined,
                        profilePic: update.imgUrl || undefined
                    }
                });
            } catch (e) {
                logger.error("Store", `Failed to sync contact ${update.id}`, e);
            }
        }
    });

    // Also listen for messaging events to auto-create contacts
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
        if (!dbSessionId) {
            const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
            if (!session) return;
            dbSessionId = session.id;
        }
        
        logger.info("Store", `Received messaging history: ${chats.length} chats, ${contacts?.length || 0} contacts, ${messages.length} messages`);
        
        // Sync chats as contacts (for personal chats)
        for (const chat of chats) {
            try {
                if (!chat.id || chat.id.includes('@g.us') || chat.id.includes('@broadcast')) continue;
                
                const chatWithNotify = chat as typeof chat & { notify?: string };
                await prisma.contact.upsert({
                    where: { sessionId_jid: { sessionId: dbSessionId, jid: chat.id } },
                    create: {
                        sessionId: dbSessionId,
                        jid: chat.id,
                        name: chat.name || undefined,
                        notify: chatWithNotify.notify || undefined
                    },
                    update: {
                        name: chat.name || undefined
                    }
                });
            } catch (e) {
                logger.error("Store", `Failed to sync chat contact ${chat.id}`, e);
            }
        }
        
        // Do not import the complete device address book. `contacts` may contain
        // people who never interacted with this PesanPro workspace.
        logger.success(
            "Store",
            `Synced ${chats.length} conversation contacts for session ${sessionId}; skipped ${contacts?.length || 0} address-book contacts`,
        );
    });
}
