import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { _resetEnvCache } from "./env";
import { _resetPrivateMediaStorageForTests, _setPrivateMediaStorageTransportForTests } from "./private-media-storage";

const fixture = vi.hoisted(() => ({
  root: `/tmp/pesanpro-payment-proof-${process.pid}-${Date.now()}`,
}));

import { loadPaymentProof, PAYMENT_PROOF_MAX_BYTES, storePaymentProof } from "./payment-proof";

describe("private payment proof storage", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("MEDIA_STORAGE_DRIVER", "local");
    vi.stubEnv("PRIVATE_MEDIA_PATH", fixture.root);
    vi.stubEnv("MEDIA_IMAGE_WEBP_ENABLED", "false");
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
  });

  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
    vi.unstubAllEnvs();
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
  });

  it("stores and reloads a validated proof outside the public directory", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const stored = await storePaymentProof({
      userId: "user_1",
      verificationId: "verification_1",
      declaredMimeType: "image/png",
      buffer,
    });
    expect(stored.storagePath).toBe("payment-proofs/user_1/verification_1.png");
    const loaded = await loadPaymentProof({
      userId: "user_1",
      verificationId: "verification_1",
      storagePath: stored.storagePath,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
    });
    expect(loaded.mimeType).toBe("image/png");
    expect(loaded.buffer).toEqual(buffer);
  });

  it("rejects oversized and signature-mismatched files", async () => {
    await expect(storePaymentProof({
      userId: "user_1",
      verificationId: "verification_2",
      declaredMimeType: "image/png",
      buffer: Buffer.alloc(PAYMENT_PROOF_MAX_BYTES + 1),
    })).rejects.toMatchObject({ code: "PAYMENT_PROOF_TOO_LARGE", status: 413 });

    await expect(storePaymentProof({
      userId: "user_1",
      verificationId: "verification_3",
      declaredMimeType: "image/png",
      buffer: Buffer.from("not a png"),
    })).rejects.toMatchObject({ code: "MEDIA_SIGNATURE_MISMATCH", status: 422 });
  });

  it("rejects unsafe storage identifiers", async () => {
    await expect(loadPaymentProof({ userId: "../other-user", verificationId: "verification_1" }))
      .rejects.toMatchObject({ code: "INVALID_PAYMENT_PROOF_PATH" });
  });

  it("stores payment proofs in B2 when the B2 driver is enabled", async () => {
    vi.stubEnv("MEDIA_STORAGE_DRIVER", "b2");
    vi.stubEnv("B2_ACCOUNT_ID", "account");
    vi.stubEnv("B2_ACCOUNT_KEY", "key");
    vi.stubEnv("B2_BUCKET", "bucket");
    vi.stubEnv("B2_ENDPOINT", "https://s3.us-west-004.backblazeb2.com");
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
    const put = vi.fn(async () => undefined);
    _setPrivateMediaStorageTransportForTests({
      put,
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      exists: vi.fn(async () => false),
    });
    const buffer = Buffer.from("%PDF-1.7\nproof");

    const stored = await storePaymentProof({
      userId: "user_1",
      verificationId: "verification_b2",
      declaredMimeType: "application/pdf",
      buffer,
    });

    expect(stored.storagePath).toBe("payment-proofs/user_1/verification_b2.pdf");
    expect(put).toHaveBeenCalledWith(stored.storagePath, buffer, "application/pdf");

    vi.stubEnv("MEDIA_STORAGE_DRIVER", "local");
    _resetEnvCache();
    _resetPrivateMediaStorageForTests();
  });
});
