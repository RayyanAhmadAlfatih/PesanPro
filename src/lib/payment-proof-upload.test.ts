import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetEnvCache } from "./env";
import { PAYMENT_PROOF_MAX_BYTES } from "./payment-proof";
import { _resetPaymentProofUploadStateForTests, parsePaymentProofUpload } from "./payment-proof-upload";

describe("payment proof multipart parser", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@127.0.0.1:3306/test");
    vi.stubEnv("AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("MAX_CONCURRENT_MEDIA_UPLOADS", "2");
    _resetEnvCache();
    _resetPaymentProofUploadStateForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetEnvCache();
    _resetPaymentProofUploadStateForTests();
  });

  it("streams the proof and required fields", async () => {
    const form = new FormData();
    form.set("planId", "plan-pro");
    form.set("reference", "BANK-001");
    form.set("proof", new File(["%PDF-1.7\nproof"], "proof.pdf", { type: "application/pdf" }));

    const parsed = await parsePaymentProofUpload(new Request("http://localhost/api/payment-verifications", {
      method: "POST",
      body: form,
    }));

    expect(parsed).toMatchObject({
      planId: "plan-pro",
      reference: "BANK-001",
      declaredMimeType: "application/pdf",
    });
    expect(parsed.buffer.toString()).toBe("%PDF-1.7\nproof");
  });

  it("rejects a declared multipart request above the bounded allowance", async () => {
    const request = new Request("http://localhost/api/payment-verifications", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(PAYMENT_PROOF_MAX_BYTES + 512 * 1024),
      },
      body: "--test--\r\n",
    });

    await expect(parsePaymentProofUpload(request)).rejects.toMatchObject({
      code: "PAYMENT_PROOF_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects a chunked proof once the file stream exceeds 5 MB", async () => {
    const form = new FormData();
    form.set("planId", "plan-pro");
    form.set("reference", "BANK-001");
    form.set("proof", new File([new Uint8Array(PAYMENT_PROOF_MAX_BYTES + 1)], "proof.pdf", { type: "application/pdf" }));

    await expect(parsePaymentProofUpload(new Request("http://localhost/api/payment-verifications", {
      method: "POST",
      body: form,
    }))).rejects.toMatchObject({
      code: "PAYMENT_PROOF_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects unexpected multipart fields instead of buffering arbitrary metadata", async () => {
    const form = new FormData();
    form.set("planId", "plan-pro");
    form.set("reference", "BANK-001");
    form.set("unexpected", "x");
    form.set("proof", new File(["%PDF-1.7\nproof"], "proof.pdf", { type: "application/pdf" }));

    await expect(parsePaymentProofUpload(new Request("http://localhost/api/payment-verifications", {
      method: "POST",
      body: form,
    }))).rejects.toMatchObject({ status: 400 });
  });
});
