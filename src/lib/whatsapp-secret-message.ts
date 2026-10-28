import { aesDecryptWithIV, proto } from "@whiskeysockets/baileys";
import type { WAMessageContent } from "@whiskeysockets/baileys";

/**
 * WhatsApp sends an edit from a linked device as a `secretEncryptedMessage`:
 * the new text is encrypted with the **target message's** secret and Baileys
 * does not decode it, so the edit arrives as an empty body unless we keep that
 * secret around and decrypt it ourselves.
 *
 * Only the secret is kept (32 bytes, in memory, two hours). Message text is
 * still never stored.
 */
const MAX_ENTRIES = 5_000;
const TTL_MS = 2 * 60 * 60 * 1000;

type Entry = { secret: Buffer; storedAt: number };

const secrets = new Map<string, Entry>();

function cacheKey(sessionId: string, keyId: string) {
    return `${sessionId}:${keyId}`;
}

export function rememberMessageSecret(
    sessionId: string,
    keyId: string | null | undefined,
    secret: Uint8Array | null | undefined,
    now = Date.now(),
) {
    if (!keyId || !secret || secret.length === 0) return;
    const key = cacheKey(sessionId, keyId);
    secrets.delete(key);
    secrets.set(key, { secret: Buffer.from(secret), storedAt: now });
    while (secrets.size > MAX_ENTRIES) {
        const oldest = secrets.keys().next().value;
        if (!oldest) break;
        secrets.delete(oldest);
    }
}

export function getMessageSecret(
    sessionId: string,
    keyId: string | null | undefined,
    now = Date.now(),
): Buffer | null {
    if (!keyId) return null;
    const key = cacheKey(sessionId, keyId);
    const entry = secrets.get(key);
    if (!entry) return null;
    if (now - entry.storedAt > TTL_MS) {
        secrets.delete(key);
        return null;
    }
    return entry.secret;
}

/** Decrypt a secret-encrypted message body. Returns null when anything is off. */
export function decryptSecretMessage(
    encPayload: Uint8Array | null | undefined,
    encIv: Uint8Array | null | undefined,
    secret: Uint8Array | null | undefined,
): WAMessageContent | null {
    if (!encPayload || !encIv || !secret) return null;
    try {
        const plain = aesDecryptWithIV(encPayload, secret, encIv);
        return proto.Message.decode(plain) as unknown as WAMessageContent;
    } catch {
        return null;
    }
}

export function clearMessageSecrets() {
    secrets.clear();
}

export function messageSecretCount() {
    return secrets.size;
}
