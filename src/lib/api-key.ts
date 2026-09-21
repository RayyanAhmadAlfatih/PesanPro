import crypto from "crypto";

const API_KEY_PREFIX = "wag_";
const API_KEY_SECRET_LENGTH = 32;
const API_KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function buildApiKeyPreview(apiKey: string): string {
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

export function generateApiKey(): string {
  const bytes = crypto.randomBytes(API_KEY_SECRET_LENGTH);
  let result = API_KEY_PREFIX;

  for (let i = 0; i < API_KEY_SECRET_LENGTH; i++) {
    result += API_KEY_ALPHABET.charAt(bytes[i] % API_KEY_ALPHABET.length);
  }

  return result;
}

export function createApiKeyRecord(secret = generateApiKey()) {
  return {
    secret,
    hashedKey: hashApiKey(secret),
    preview: buildApiKeyPreview(secret),
    createdAt: new Date(),
  };
}
