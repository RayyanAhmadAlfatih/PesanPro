/**
 * Which WhatsApp JIDs belong to a tenant conversation.
 *
 * Statuses (`status@broadcast`), broadcast lists and channels (`@newsletter`)
 * travel on the same update stream as normal chats. Their revoke/expiry
 * updates carry the same `messageStubType` marker as a real message delete,
 * so without this guard a tenant webhook subscribed to `message.deleted`
 * receives an event every time a contact's status disappears.
 *
 * PesanPro has no status feature (the old `status.update` event is retired),
 * so those JIDs are never tenant messages.
 */
export function isTenantChatJid(jid: string | null | undefined): boolean {
    if (!jid) return false;
    if (jid === "status@broadcast") return false;
    if (jid.endsWith("@broadcast")) return false;
    if (jid.endsWith("@newsletter")) return false;
    return true;
}
