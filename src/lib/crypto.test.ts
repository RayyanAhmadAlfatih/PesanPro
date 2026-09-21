import { describe, it, expect, beforeEach, vi } from "vitest";
import { _resetEnvCache } from "./env";

describe("crypto AES-256-GCM", () => {
  const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-at-least-32-chars-long!!");
    vi.stubEnv("BASE_URL", "http://localhost:3000");
    _resetEnvCache();
    vi.resetModules();
  });

  it("encrypts and decrypts round-trip", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = JSON.stringify({ creds: "test-creds", keys: [1, 2, 3] });
    const { encValue, iv, authTag } = encrypt(plaintext);
    expect(encValue).toBeDefined();
    expect(iv).toBeDefined();
    expect(authTag).toBeDefined();
    const decrypted = decrypt(encValue, iv, authTag);
    expect(decrypted).toBe(plaintext);
  });

  it("different IV per encryption (non-deterministic)", async () => {
    const { encrypt } = await import("./crypto");
    const a = encrypt("same plaintext");
    const b = encrypt("same plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.encValue).not.toBe(b.encValue);
  });

  it("fails with tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const { encValue, iv, authTag } = encrypt("hello");
    const tampered = encValue.slice(0, -4) + "AAAA";
    expect(() => decrypt(tampered, iv, authTag)).toThrow();
  });

  it("fails with wrong key", async () => {
    const { encrypt } = await import("./crypto");
    const { encValue, iv, authTag } = encrypt("secret");
    vi.stubEnv("ENCRYPTION_KEY", "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    _resetEnvCache();
    vi.resetModules();
    const { decrypt } = await import("./crypto");
    expect(() => decrypt(encValue, iv, authTag)).toThrow();
  });

  it("encryptJson / decryptJson round-trip", async () => {
    const { encryptJson, decryptJson } = await import("./crypto");
    const payload = { a: 1, b: "hello", nested: { c: true } };
    const { encValue, iv, authTag } = encryptJson(payload);
    const out = decryptJson<typeof payload>(encValue, iv, authTag);
    expect(out).toEqual(payload);
  });
});
