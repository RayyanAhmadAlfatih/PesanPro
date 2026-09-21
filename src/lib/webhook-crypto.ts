import crypto from "node:crypto";

export type EncryptedWebhookSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

type StoredWebhookSecrets = {
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
  previousSecretCiphertext?: string | null;
  previousSecretIv?: string | null;
  previousSecretTag?: string | null;
  previousSecretExpiresAt?: Date | null;
};

function encryptionKey(keyHex = process.env.ENCRYPTION_KEY) {
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hexadecimal value");
  }
  return Buffer.from(keyHex, "hex");
}

export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}

export function encryptWebhookSecret(secret: string, keyHex?: string): EncryptedWebhookSecret {
  if (secret.length < 32 || secret.length > 512) throw new Error("Webhook secret must contain 32-512 characters");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecretParts(parts: EncryptedWebhookSecret, keyHex?: string) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(keyHex), Buffer.from(parts.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parts.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptCurrentWebhookSecret(endpoint: StoredWebhookSecrets, keyHex?: string) {
  if (!endpoint.secretCiphertext || !endpoint.secretIv || !endpoint.secretTag) {
    throw new Error("Webhook endpoint has no encrypted signing secret");
  }
  return decryptSecretParts({ ciphertext: endpoint.secretCiphertext, iv: endpoint.secretIv, tag: endpoint.secretTag }, keyHex);
}

export function decryptPreviousWebhookSecret(endpoint: StoredWebhookSecrets, now = new Date(), keyHex?: string) {
  if (
    !endpoint.previousSecretCiphertext ||
    !endpoint.previousSecretIv ||
    !endpoint.previousSecretTag ||
    !endpoint.previousSecretExpiresAt ||
    endpoint.previousSecretExpiresAt <= now
  ) return null;
  return decryptSecretParts({
    ciphertext: endpoint.previousSecretCiphertext,
    iv: endpoint.previousSecretIv,
    tag: endpoint.previousSecretTag,
  }, keyHex);
}

export function secretPreview(secret: string) {
  return `${secret.slice(0, 10)}...${secret.slice(-6)}`;
}

