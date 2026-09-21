import { MessageJobType } from "@prisma/client";
import { MessageJobError } from "./message-job-errors";

export type MediaInspection = {
  mediaType: Exclude<MessageJobType, "TEXT">;
  mimeType: string;
  extension: string;
};

const MIME_TYPES: Record<string, MediaInspection> = {
  "image/jpeg": { mediaType: "IMAGE", mimeType: "image/jpeg", extension: "jpg" },
  "image/png": { mediaType: "IMAGE", mimeType: "image/png", extension: "png" },
  "image/webp": { mediaType: "IMAGE", mimeType: "image/webp", extension: "webp" },
  "video/mp4": { mediaType: "VIDEO", mimeType: "video/mp4", extension: "mp4" },
  "audio/mpeg": { mediaType: "AUDIO", mimeType: "audio/mpeg", extension: "mp3" },
  "audio/ogg": { mediaType: "AUDIO", mimeType: "audio/ogg", extension: "ogg" },
  "audio/mp4": { mediaType: "AUDIO", mimeType: "audio/mp4", extension: "m4a" },
  "audio/wav": { mediaType: "AUDIO", mimeType: "audio/wav", extension: "wav" },
  "application/pdf": { mediaType: "DOCUMENT", mimeType: "application/pdf", extension: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { mediaType: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { mediaType: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { mediaType: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx" },
  "text/plain": { mediaType: "DOCUMENT", mimeType: "text/plain", extension: "txt" },
};

function startsWith(buffer: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

export function inspectPrivateMedia(buffer: Buffer, declaredMimeType: string): MediaInspection {
  const normalizedMime = declaredMimeType.toLowerCase().split(";")[0]?.trim();
  const inspection = normalizedMime ? MIME_TYPES[normalizedMime] : undefined;
  if (!inspection) throw new MessageJobError("UNSUPPORTED_MEDIA_TYPE", "Media type is not supported", 415, false);
  if (buffer.length === 0) throw new MessageJobError("EMPTY_MEDIA", "Media file is empty", 422, false);

  const valid = normalizedMime === "image/jpeg" ? startsWith(buffer, [0xff, 0xd8, 0xff])
    : normalizedMime === "image/png" ? startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : normalizedMime === "image/webp" ? buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
        : normalizedMime === "video/mp4" || normalizedMime === "audio/mp4" ? buffer.subarray(4, 8).toString("ascii") === "ftyp"
          : normalizedMime === "audio/mpeg" ? startsWith(buffer, [0x49, 0x44, 0x33]) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
            : normalizedMime === "audio/ogg" ? buffer.subarray(0, 4).toString("ascii") === "OggS"
              : normalizedMime === "audio/wav" ? buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE"
                : normalizedMime === "application/pdf" ? buffer.subarray(0, 5).toString("ascii") === "%PDF-"
                  : normalizedMime === "text/plain" ? !buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)
                    : startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);

  if (!valid) throw new MessageJobError("MEDIA_SIGNATURE_MISMATCH", "File contents do not match the declared media type", 422, false);
  return inspection;
}
