import crypto from "crypto";
import { getEnv } from "./env";

const ALGO = "aes-256-gcm" as const;
const IV_LENGTH = 12;

/**
 * Derive 32-byte key from ENCRYPTION_KEY hex string
 */
function getKey(): Buffer {
  const hex = getEnv().ENCRYPTION_KEY;
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * Returns base64-encoded iv, authTag, and ciphertext.
 */
export function encrypt(plaintext: string): { encValue: string; iv: string; authTag: string } {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 */
export function decrypt(encValue: string, iv: string, authTag: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encValue, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt arbitrary JSON-serialisable value (used for AuthState)
 */
export function encryptJson(value: unknown): { encValue: string; iv: string; authTag: string } {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = unknown>(encValue: string, iv: string, authTag: string): T {
  return JSON.parse(decrypt(encValue, iv, authTag)) as T;
}

/**
 * Whether a record looks encrypted (has all three fields populated)
 */
export function isEncryptedRecord(rec: { encValue?: string | null; iv?: string | null; authTag?: string | null }): boolean {
  return !!(rec.encValue && rec.iv && rec.authTag);
}
