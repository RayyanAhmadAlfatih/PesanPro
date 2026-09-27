import path from "node:path";
import type { MessageJobType, Prisma } from "@prisma/client";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";
import { fetchPublicBuffer, PublicFetchError, SSRFError, validatePublicUrl } from "./ssrf";

export type RemoteMediaPayload = {
  mediaUrl: string;
  fileName?: string;
  mimeType?: string;
};

export type FetchedRemoteMedia = {
  buffer: Buffer;
  mimeType?: string;
  fileName: string;
};

function normalizeMimeType(value: string | null | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase() || undefined;
}

function assertMimeMatchesMessageType(type: Exclude<MessageJobType, "TEXT">, mimeType: string | undefined) {
  if (!mimeType) return;
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    throw new MessageJobError("REMOTE_MEDIA_TYPE_MISMATCH", "Remote media returned an HTML document", 422, false);
  }
  if (type === "IMAGE" && !mimeType.startsWith("image/")) {
    throw new MessageJobError("REMOTE_MEDIA_TYPE_MISMATCH", "Remote media is not an image", 422, false);
  }
  if (type === "VIDEO" && !mimeType.startsWith("video/")) {
    throw new MessageJobError("REMOTE_MEDIA_TYPE_MISMATCH", "Remote media is not a video", 422, false);
  }
  if (type === "AUDIO" && !mimeType.startsWith("audio/")) {
    throw new MessageJobError("REMOTE_MEDIA_TYPE_MISMATCH", "Remote media is not audio", 422, false);
  }
}

export async function validateRemoteMediaUrl(rawUrl: string) {
  if (rawUrl.length > 2048) {
    throw new MessageJobError("INVALID_MEDIA_URL", "Media URL is too long", 422, false);
  }
  try {
    return (await validatePublicUrl(rawUrl)).toString();
  } catch {
    throw new MessageJobError("INVALID_MEDIA_URL", "Media URL must point to a public HTTP or HTTPS resource", 422, false);
  }
}

export function remoteMediaFromRequestPayload(payload: Prisma.JsonValue): RemoteMediaPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const mediaUrl = typeof payload.mediaUrl === "string" ? payload.mediaUrl : null;
  if (!mediaUrl) return null;
  return {
    mediaUrl,
    fileName: typeof payload.fileName === "string" ? payload.fileName : undefined,
    mimeType: typeof payload.mimeType === "string" ? payload.mimeType : undefined,
  };
}

function remoteFileName(remote: RemoteMediaPayload, finalUrl = remote.mediaUrl) {
  if (remote.fileName?.trim()) return path.basename(remote.fileName.trim()).slice(0, 191);
  try {
    return path.basename(decodeURIComponent(new URL(finalUrl).pathname)).slice(0, 191) || "document";
  } catch {
    return "document";
  }
}

function remoteFetchError(error: unknown): MessageJobError {
  if (error instanceof MessageJobError) return error;
  if (error instanceof SSRFError) {
    return new MessageJobError("INVALID_MEDIA_URL", "Remote media no longer resolves to a public resource", 422, false);
  }
  if (error instanceof PublicFetchError) {
    if (error.code === "REMOTE_FETCH_TOO_LARGE") {
      return new MessageJobError("REMOTE_MEDIA_TOO_LARGE", "Remote media exceeds the configured size limit", 413, false);
    }
    if (error.code === "REMOTE_FETCH_TIMEOUT") {
      return new MessageJobError("REMOTE_MEDIA_TIMEOUT", "Remote media fetch timed out", 504, true);
    }
    if (error.code === "REMOTE_FETCH_NETWORK") {
      return new MessageJobError("REMOTE_MEDIA_UNAVAILABLE", "Remote media could not be fetched", 503, true);
    }
    if (error.code === "REMOTE_FETCH_HTTP_STATUS") {
      return new MessageJobError(
        "REMOTE_MEDIA_HTTP_ERROR",
        "Remote media server returned an unusable response",
        error.retryable ? 503 : 422,
        error.retryable,
      );
    }
    return new MessageJobError("INVALID_MEDIA_URL", error.message, 422, false);
  }
  return new MessageJobError("REMOTE_MEDIA_UNAVAILABLE", "Remote media could not be fetched", 503, true);
}

export async function fetchRemoteMediaForDelivery(
  type: Exclude<MessageJobType, "TEXT">,
  remote: RemoteMediaPayload,
): Promise<FetchedRemoteMedia> {
  const declaredMimeType = normalizeMimeType(remote.mimeType);
  assertMimeMatchesMessageType(type, declaredMimeType);

  try {
    const env = getEnv();
    const fetched = await fetchPublicBuffer(remote.mediaUrl, {
      timeoutMs: 15_000,
      maxBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
      maxRedirects: 3,
    });
    const responseMimeType = normalizeMimeType(fetched.contentType);
    const responseIsGeneric = responseMimeType === "application/octet-stream";
    if (responseMimeType === "text/html" || responseMimeType === "application/xhtml+xml") {
      assertMimeMatchesMessageType(type, responseMimeType);
    } else if (!responseIsGeneric || !declaredMimeType) {
      assertMimeMatchesMessageType(type, responseMimeType);
    }
    return {
      buffer: fetched.buffer,
      mimeType: responseIsGeneric && declaredMimeType
        ? declaredMimeType
        : responseMimeType ?? declaredMimeType,
      fileName: remoteFileName(remote, fetched.finalUrl),
    };
  } catch (error) {
    throw remoteFetchError(error);
  }
}

export function buildRemoteMediaContent(
  type: Exclude<MessageJobType, "TEXT">,
  remote: FetchedRemoteMedia,
  caption?: string | null,
): AnyMessageContent {
  const common = {
    caption: caption || undefined,
    ...(remote.mimeType ? { mimetype: remote.mimeType } : {}),
  };
  if (type === "IMAGE") return { image: remote.buffer, ...common };
  if (type === "VIDEO") return { video: remote.buffer, ...common };
  if (type === "AUDIO") return { audio: remote.buffer, ...(remote.mimeType ? { mimetype: remote.mimeType } : {}), ptt: false };
  return {
    document: remote.buffer,
    fileName: remote.fileName,
    ...common,
    mimetype: remote.mimeType || "application/octet-stream",
  };
}
