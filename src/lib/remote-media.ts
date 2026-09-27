import path from "node:path";
import type { MessageJobType, Prisma } from "@prisma/client";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { MessageJobError } from "./message-job-errors";
import { safeFetchBuffer, SSRFError, validatePublicUrl } from "./ssrf";

export type RemoteMediaPayload = {
  mediaUrl: string;
  fileName?: string;
  mimeType?: string;
};

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

function remoteFileName(remote: RemoteMediaPayload) {
  if (remote.fileName?.trim()) return path.basename(remote.fileName.trim()).slice(0, 191);
  try {
    return path.basename(decodeURIComponent(new URL(remote.mediaUrl).pathname)).slice(0, 191) || "document";
  } catch {
    return "document";
  }
}

export async function loadRemoteMediaBuffer(remote: RemoteMediaPayload, maxBytes: number) {
  try {
    return await safeFetchBuffer(remote.mediaUrl, { timeoutMs: 15_000, maxBytes, maxRedirects: 2 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof SSRFError && message.includes("too large")) {
      throw new MessageJobError("REMOTE_MEDIA_TOO_LARGE", "Remote media exceeds the configured upload limit", 413, false);
    }
    if (message.includes("timed out") || /HTTP 5\d\d/.test(message)) {
      throw new MessageJobError("REMOTE_MEDIA_UNAVAILABLE", "Remote media is temporarily unavailable", 503, true);
    }
    throw new MessageJobError("REMOTE_MEDIA_UNAVAILABLE", "Remote media URL could not be fetched safely", 422, false);
  }
}

export function buildRemoteMediaContent(
  type: Exclude<MessageJobType, "TEXT">,
  remote: RemoteMediaPayload,
  buffer: Buffer,
  caption?: string | null,
): AnyMessageContent {
  const common = {
    caption: caption || undefined,
    ...(remote.mimeType ? { mimetype: remote.mimeType } : {}),
  };
  if (type === "IMAGE") return { image: buffer, ...common };
  if (type === "VIDEO") return { video: buffer, ...common };
  if (type === "AUDIO") return { audio: buffer, mimetype: remote.mimeType, ptt: false };
  return {
    document: buffer,
    fileName: remoteFileName(remote),
    ...common,
    mimetype: remote.mimeType || "application/octet-stream",
  };
}
