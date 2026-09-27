import crypto from "node:crypto";
import { MessageJobError } from "./message-job-errors";
import { prepareMediaForStorage } from "./media-optimization";
import {
  deletePrivateMediaObject,
  loadPrivateMediaObject,
  storePrivateMediaObject,
} from "./private-media-storage";

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

function proofStoragePath(userId: string, verificationId: string, extension: string) {
  assertSafeId(userId);
  assertSafeId(verificationId);
  return `payment-proofs/${userId}/${verificationId}.${extension}`;
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
  const prepared = await prepareMediaForStorage(input.buffer, input.declaredMimeType);
  const { inspection } = prepared;
  if (prepared.buffer.length > PAYMENT_PROOF_MAX_BYTES) {
    throw new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false);
  }
  if (!PAYMENT_PROOF_ACCEPT.includes(inspection.mimeType as (typeof PAYMENT_PROOF_ACCEPT)[number])) {
    throw new MessageJobError("UNSUPPORTED_PAYMENT_PROOF", "Use a JPG, PNG, WebP, or PDF payment proof", 415, false);
  }
  const storagePath = proofStoragePath(input.userId, input.verificationId, inspection.extension);
  await storePrivateMediaObject({ storagePath, buffer: prepared.buffer, mimeType: inspection.mimeType });
  return {
    storagePath,
    mimeType: inspection.mimeType,
    sizeBytes: BigInt(prepared.buffer.length),
    checksumSha256: crypto.createHash("sha256").update(prepared.buffer).digest("hex"),
  };
}

export async function deleteStoredPaymentProof(storagePath: string, verificationId: string) {
  await deletePrivateMediaObject({ cacheKey: `payment-proof:${verificationId}`, storagePath });
}

export async function loadPaymentProof(input: {
  userId: string;
  verificationId: string;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: bigint | null;
  checksumSha256?: string | null;
}) {
  assertSafeId(input.userId);
  assertSafeId(input.verificationId);
  const candidates = input.storagePath && input.mimeType
    ? [[input.storagePath, input.mimeType] as const]
    : [...extensionMime].map(([extension, mimeType]) => [proofStoragePath(input.userId, input.verificationId, extension), mimeType] as const);
  for (const [storagePath, mimeType] of candidates) {
    const buffer = await loadPrivateMediaObject({ cacheKey: `payment-proof:${input.verificationId}`, storagePath });
    if (!buffer) continue;
    if (input.sizeBytes !== null && input.sizeBytes !== undefined && BigInt(buffer.length) !== input.sizeBytes) {
      throw new MessageJobError("PAYMENT_PROOF_INTEGRITY_FAILED", "Payment proof failed integrity validation", 410, false);
    }
    if (input.checksumSha256) {
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
      if (checksum !== input.checksumSha256) {
        throw new MessageJobError("PAYMENT_PROOF_INTEGRITY_FAILED", "Payment proof failed integrity validation", 410, false);
      }
    }
    return { buffer, mimeType, storagePath };
  }
  throw new MessageJobError("PAYMENT_PROOF_NOT_FOUND", "Payment proof file was not found", 404, false);
}
