import { describe, expect, it } from "vitest";
import { buildApiKeyPreview, createApiKeyRecord, generateApiKey, hashApiKey } from "./api-key";

describe("api key helpers", () => {
  it("generates prefixed secrets with stable preview and hash", () => {
    const secret = generateApiKey();
    const record = createApiKeyRecord(secret);

    expect(secret.startsWith("wag_")).toBe(true);
    expect(secret).toHaveLength(36);
    expect(record.preview).toBe(`${secret.slice(0, 8)}...${secret.slice(-4)}`);
    expect(record.hashedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(secret)).toBe(record.hashedKey);
  });

  it("builds previews without exposing the whole secret", () => {
    const preview = buildApiKeyPreview("wag_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");

    expect(preview).toBe("wag_ABCD...3456");
    expect(preview.includes("EFGHIJKLMNOPQRSTUVWXYZ123")).toBe(false);
  });
});
