import { describe, expect, it } from "vitest";
import { decryptSecretParts, encryptWebhookSecret, generateWebhookSecret } from "./webhook-crypto";

describe("webhook secret encryption", () => {
  const key = "11".repeat(32);

  it("round-trips a generated secret with AES-256-GCM", () => {
    const secret = generateWebhookSecret();
    const encrypted = encryptWebhookSecret(secret, key);
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptSecretParts(encrypted, key)).toBe(secret);
  });

  it("uses a fresh IV for every encryption", () => {
    const secret = generateWebhookSecret();
    expect(encryptWebhookSecret(secret, key).iv).not.toBe(encryptWebhookSecret(secret, key).iv);
  });

  it("fails closed with the wrong encryption key", () => {
    const encrypted = encryptWebhookSecret(generateWebhookSecret(), key);
    expect(() => decryptSecretParts(encrypted, "22".repeat(32))).toThrow();
  });
});

