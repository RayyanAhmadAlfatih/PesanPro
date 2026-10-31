import crypto from "node:crypto";
import { Readable } from "node:stream";
import Busboy from "busboy";
import { MessageJobError } from "./message-job-errors";
import { prepareMediaForStorage } from "./media-optimization";
import {
  deletePrivateMediaObject,
  loadPrivateMediaObject,
  storePrivateMediaObject,
} from "./private-media-storage";

export const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PAYMENT_PROOF_ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

export type ParsedPaymentProofUpload = {
  buffer: Buffer;
  declaredMimeType: string;
  originalName: string;
  planId: string;
  reference: string;
  /** Raw multipart value. Validated against the enum by the caller. */
  billingCycle: string;
};

/**
 * Parse a payment-proof submission as a stream.
 *
 * `request.formData()` buffers the entire request body before any size check, so
 * a caller sending `Transfer-Encoding: chunked` (no `Content-Length`) could force
 * an unbounded allocation. This mirrors the hardened streaming parser used for
 * private media: the file stream is capped while it is read, never after.
 */
export async function parsePaymentProofUpload(request: Request): Promise<ParsedPaymentProofUpload> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > PAYMENT_PROOF_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false);
  }
  if (!request.body) {
    throw new MessageJobError("PAYMENT_PROOF_REQUIRED", "Payment proof file is required", 422, false);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new MessageJobError("UNSUPPORTED_PAYMENT_PROOF", "Payment proof must use multipart/form-data", 415, false);
  }

  return new Promise<ParsedPaymentProofUpload>((resolve, reject) => {
    let settled = false;
    let planId = "";
    let reference = "";
    let billingCycle = "";
    let fileResult: Omit<ParsedPaymentProofUpload, "planId" | "reference" | "billingCycle"> | null = null;
    let fileCount = 0;
    let tooLarge = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: Object.fromEntries(request.headers.entries()),
        limits: { fileSize: PAYMENT_PROOF_MAX_BYTES, files: 1, fields: 4, parts: 6 },
      });
    } catch {
      fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof body is invalid", 400, false));
      return;
    }

    parser.on("field", (name, value) => {
      if (name === "planId") planId = value;
      if (name === "reference") reference = value;
      if (name === "billingCycle") billingCycle = value;
    });
    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      if (fieldName !== "proof" || fileCount > 1) {
        stream.resume();
        fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Exactly one payment proof file is required", 422, false));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("limit", () => { tooLarge = true; });
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= PAYMENT_PROOF_MAX_BYTES) chunks.push(chunk);
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (tooLarge) return;
        fileResult = {
          buffer: Buffer.concat(chunks, size),
          declaredMimeType: info.mimeType,
          originalName: info.filename,
        };
      });
    });
    parser.on("filesLimit", () => fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Exactly one payment proof file is required", 422, false)));
    parser.on("partsLimit", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof contains too many parts", 400, false)));
    parser.on("error", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof body is invalid", 400, false)));
    parser.on("close", () => {
      if (settled) return;
      if (tooLarge) {
        fail(new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false));
        return;
      }
      if (!fileResult) {
        fail(new MessageJobError("PAYMENT_PROOF_REQUIRED", "Payment proof file is required", 422, false));
        return;
      }
      settled = true;
      resolve({ ...fileResult, planId, reference, billingCycle });
    });

    Readable.fromWeb(request.body as never)
      .on("error", fail)
      .pipe(parser);
  });
}

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
  // Payment proofs are onboarding artifacts, not tenant media. A new account is
  // still on the PENDING plan, which has no storage allowance by design, so
  // charging this upload to MEDIA_STORAGE_BYTES made it impossible to pay. The
  // 5 MB cap and the per-IP/per-user rate limit bound the space instead.
  await storePrivateMediaObject({ storagePath, buffer: prepared.buffer, mimeType: inspection.mimeType });
  return {
    storagePath,
    mimeType: inspection.mimeType,
    sizeBytes: BigInt(prepared.buffer.length),
    checksumSha256: crypto.createHash("sha256").update(prepared.buffer).digest("hex"),
  };
}

export async function deleteStoredPaymentProof(
  storagePath: string,
  verificationId: string,
) {
  // Proofs no longer reserve MEDIA_STORAGE_BYTES, so deleting one must not
  // decrement a counter it never incremented.
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
