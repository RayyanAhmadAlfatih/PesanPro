import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { MessageJobError } from "./message-job-errors";
import { getPrivateMediaRoot } from "./private-media";
import { inspectPrivateMedia } from "./private-media-validation";

export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const extensionMime = new Map([
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
]);

function assertSafeId(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new MessageJobError("INVALID_PAYMENT_PROOF_PATH", "Payment proof path is invalid", 400, false);
  }
}

function proofDirectory(userId: string) {
  assertSafeId(userId);
  return path.join(getPrivateMediaRoot(), "payment-proofs", userId);
}

export async function storePaymentProof(input: {
  userId: string;
  verificationId: string;
  declaredMimeType: string;
  buffer: Buffer;
}) {
  assertSafeId(input.verificationId);
  if (input.buffer.length > PAYMENT_PROOF_MAX_BYTES) {
    throw new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false);
  }
  const inspection = inspectPrivateMedia(input.buffer, input.declaredMimeType);
  if (!PAYMENT_PROOF_ACCEPT.includes(inspection.mimeType as (typeof PAYMENT_PROOF_ACCEPT)[number])) {
    throw new MessageJobError("UNSUPPORTED_PAYMENT_PROOF", "Use a JPG, PNG, WebP, or PDF payment proof", 415, false);
  }
  const directory = proofDirectory(input.userId);
  const absolutePath = path.join(directory, `${input.verificationId}.${inspection.extension}`);
  await mkdir(directory, { recursive: true });
  await writeFile(absolutePath, input.buffer, { flag: "wx", mode: 0o600 });
  return { absolutePath, mimeType: inspection.mimeType };
}

export async function deleteStoredPaymentProof(absolutePath: string) {
  await unlink(absolutePath).catch(() => undefined);
}

export async function loadPaymentProof(userId: string, verificationId: string) {
  assertSafeId(verificationId);
  const directory = proofDirectory(userId);
  for (const [extension, mimeType] of extensionMime) {
    const buffer = await readFile(path.join(directory, `${verificationId}.${extension}`)).catch(() => null);
    if (buffer) return { buffer, mimeType };
  }
  throw new MessageJobError("PAYMENT_PROOF_NOT_FOUND", "Payment proof file was not found", 404, false);
}
