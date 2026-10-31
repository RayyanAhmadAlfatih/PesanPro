import { Readable } from "node:stream";
import Busboy from "busboy";
import { MessageJobError } from "./message-job-errors";
import { PAYMENT_PROOF_MAX_BYTES } from "./payment-proof";

const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

export type RegistrationFields = {
  name: string;
  email: string;
  password: string;
  planId: string;
  reference: string;
  billingCycle: string;
};

export type ParsedRegistrationUpload = {
  buffer: Buffer;
  declaredMimeType: string;
  originalName: string;
  fields: RegistrationFields;
};

/**
 * Parse the sign-up body as a stream.
 *
 * Registration now carries a payment proof, so the body is multipart and can be
 * large. Parsing it with `request.formData()` would buffer the whole request
 * before the size check, which lets a chunked upload allocate without bound.
 * The file stream is capped while it is read instead.
 */
export async function parseRegistrationUpload(request: Request): Promise<ParsedRegistrationUpload> {
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > PAYMENT_PROOF_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new MessageJobError("PAYMENT_PROOF_TOO_LARGE", "Payment proof must be 5 MB or smaller", 413, false);
  }
  if (!request.body) {
    throw new MessageJobError("PAYMENT_PROOF_REQUIRED", "Payment proof file is required", 422, false);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new MessageJobError("UNSUPPORTED_PAYMENT_PROOF", "Registration must use multipart/form-data", 415, false);
  }

  return new Promise<ParsedRegistrationUpload>((resolve, reject) => {
    let settled = false;
    const fields: RegistrationFields = {
      name: "",
      email: "",
      password: "",
      planId: "",
      reference: "",
      billingCycle: "",
    };
    let fileResult: Omit<ParsedRegistrationUpload, "fields"> | null = null;
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
        limits: { fileSize: PAYMENT_PROOF_MAX_BYTES, files: 1, fields: 6, parts: 8 },
      });
    } catch {
      fail(new MessageJobError("INVALID_MULTIPART_BODY", "Registration body is invalid", 400, false));
      return;
    }

    parser.on("field", (name, value) => {
      if (name in fields) fields[name as keyof RegistrationFields] = value;
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
    parser.on("partsLimit", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Registration body contains too many parts", 400, false)));
    parser.on("error", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Registration body is invalid", 400, false)));
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
      resolve({ ...fileResult, fields });
    });

    Readable.fromWeb(request.body as never)
      .on("error", fail)
      .pipe(parser);
  });
}
