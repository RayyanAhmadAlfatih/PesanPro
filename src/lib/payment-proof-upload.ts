import { Readable } from "node:stream";
import Busboy from "busboy";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";
import { PAYMENT_PROOF_MAX_BYTES } from "./payment-proof";

const MULTIPART_OVERHEAD_BYTES = 256 * 1024;
let activeUploads = 0;

export type ParsedPaymentProofUpload = {
  planId: string;
  reference: string;
  declaredMimeType: string;
  buffer: Buffer;
};

function contentLength(request: Request) {
  const value = request.headers.get("content-length");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function withUploadSlot<T>(operation: () => Promise<T>) {
  const limit = getEnv().MAX_CONCURRENT_MEDIA_UPLOADS;
  if (activeUploads >= limit) {
    throw new MessageJobError("PAYMENT_PROOF_UPLOAD_BUSY", "Too many payment proof uploads are in progress", 429, true);
  }
  activeUploads += 1;
  try {
    return await operation();
  } finally {
    activeUploads -= 1;
  }
}

export async function parsePaymentProofUpload(request: Request): Promise<ParsedPaymentProofUpload> {
  return withUploadSlot(async () => {
    const declaredLength = contentLength(request);
    if (declaredLength !== null && declaredLength > PAYMENT_PROOF_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      throw new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false);
    }
    if (!request.body) throw new MessageJobError("INVALID_PAYMENT_PROOF", "Payment proof file is required", 400, false);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new MessageJobError("UNSUPPORTED_CONTENT_TYPE", "Payment proof uploads must use multipart/form-data", 415, false);
    }

    return new Promise<ParsedPaymentProofUpload>((resolve, reject) => {
      let settled = false;
      let planId = "";
      let reference = "";
      let file: { declaredMimeType: string; buffer: Buffer } | null = null;
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
          limits: {
            fileSize: PAYMENT_PROOF_MAX_BYTES,
            files: 1,
            fields: 2,
            fieldSize: 512,
            parts: 3,
          },
        });
      } catch {
        fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof upload body is invalid", 400, false));
        return;
      }

      parser.on("field", (name, value, info) => {
        if (info.valueTruncated) {
          fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Payment proof fields are too large", 400, false));
          return;
        }
        if (name === "planId") planId = value;
        else if (name === "reference") reference = value;
      });

      parser.on("file", (fieldName, stream, info) => {
        fileCount += 1;
        if (fieldName !== "proof" || fileCount > 1) {
          stream.resume();
          fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Exactly one payment proof file is required", 400, false));
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
          file = {
            declaredMimeType: info.mimeType,
            buffer: Buffer.concat(chunks, size),
          };
        });
      });

      parser.on("filesLimit", () => fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Exactly one payment proof file is required", 400, false)));
      parser.on("fieldsLimit", () => fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Payment proof contains too many fields", 400, false)));
      parser.on("partsLimit", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof upload contains too many parts", 400, false)));
      parser.on("error", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Payment proof upload body is invalid", 400, false)));
      parser.on("close", () => {
        if (settled) return;
        if (tooLarge) {
          fail(new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false));
          return;
        }
        if (!file) {
          fail(new MessageJobError("INVALID_PAYMENT_PROOF", "Payment proof file is required", 400, false));
          return;
        }
        settled = true;
        resolve({ planId, reference, declaredMimeType: file.declaredMimeType, buffer: file.buffer });
      });

      Readable.fromWeb(request.body as never)
        .on("error", fail)
        .pipe(parser);
    });
  });
}

export function _resetPaymentProofUploadStateForTests() {
  activeUploads = 0;
}
