import { Readable } from "node:stream";
import Busboy from "busboy";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
let activeUploads = 0;

export type ParsedPrivateMediaUpload = {
  originalName: string;
  declaredMimeType: string;
  sessionPublicId?: string;
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
    throw new MessageJobError("MEDIA_UPLOAD_BUSY", "Too many media uploads are in progress", 429, true);
  }
  activeUploads += 1;
  try {
    return await operation();
  } finally {
    activeUploads -= 1;
  }
}

export async function parsePrivateMediaUpload(request: Request): Promise<ParsedPrivateMediaUpload> {
  return withUploadSlot(async () => {
    const env = getEnv();
    const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    const declaredLength = contentLength(request);
    if (declaredLength !== null && declaredLength > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      throw new MessageJobError("MEDIA_TOO_LARGE", `Media exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`, 413, false);
    }
    if (!request.body) throw new MessageJobError("VALIDATION_ERROR", "A media file is required", 422, false);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new MessageJobError("UNSUPPORTED_CONTENT_TYPE", "Media uploads must use multipart/form-data", 415, false);
    }

    return new Promise<ParsedPrivateMediaUpload>((resolve, reject) => {
      let settled = false;
      let sessionPublicId: string | undefined;
      let fileResult: Omit<ParsedPrivateMediaUpload, "sessionPublicId"> | null = null;
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
          limits: { fileSize: maxBytes, files: 1, fields: 1, parts: 3 },
        });
      } catch {
        fail(new MessageJobError("INVALID_MULTIPART_BODY", "Media upload body is invalid", 400, false));
        return;
      }

      parser.on("field", (name, value) => {
        if (name === "sessionId" && value.trim()) sessionPublicId = value.trim();
      });
      parser.on("file", (fieldName, stream, info) => {
        fileCount += 1;
        if (fieldName !== "file" || fileCount > 1) {
          stream.resume();
          fail(new MessageJobError("VALIDATION_ERROR", "Exactly one media file is required", 422, false));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("limit", () => { tooLarge = true; });
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= maxBytes) chunks.push(chunk);
        });
        stream.on("error", fail);
        stream.on("end", () => {
          if (tooLarge) return;
          fileResult = {
            originalName: info.filename,
            declaredMimeType: info.mimeType,
            buffer: Buffer.concat(chunks, size),
          };
        });
      });
      parser.on("filesLimit", () => fail(new MessageJobError("VALIDATION_ERROR", "Exactly one media file is required", 422, false)));
      parser.on("partsLimit", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Media upload contains too many parts", 400, false)));
      parser.on("error", () => fail(new MessageJobError("INVALID_MULTIPART_BODY", "Media upload body is invalid", 400, false)));
      parser.on("close", () => {
        if (settled) return;
        if (tooLarge) {
          fail(new MessageJobError("MEDIA_TOO_LARGE", `Media exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`, 413, false));
          return;
        }
        if (!fileResult) {
          fail(new MessageJobError("VALIDATION_ERROR", "A media file is required", 422, false));
          return;
        }
        settled = true;
        resolve({ ...fileResult, sessionPublicId });
      });

      Readable.fromWeb(request.body as never)
        .on("error", fail)
        .pipe(parser);
    });
  });
}
