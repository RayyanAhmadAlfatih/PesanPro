import { afterAll, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";

const fixture = vi.hoisted(() => ({
  root: `/tmp/pesanpro-payment-proof-${process.pid}-${Date.now()}`,
}));

vi.mock("./private-media", () => ({ getPrivateMediaRoot: () => fixture.root }));

import { loadPaymentProof, PAYMENT_PROOF_MAX_BYTES, storePaymentProof } from "./payment-proof";

describe("private payment proof storage", () => {
  afterAll(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("stores and reloads a validated proof outside the public directory", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const stored = await storePaymentProof({
      userId: "user_1",
      verificationId: "verification_1",
      declaredMimeType: "image/png",
      buffer,
    });
    expect(stored.absolutePath).toContain("payment-proofs/user_1/verification_1.png");
    const loaded = await loadPaymentProof("user_1", "verification_1");
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
    await expect(loadPaymentProof("../other-user", "verification_1"))
      .rejects.toMatchObject({ code: "INVALID_PAYMENT_PROOF_PATH" });
  });
});
