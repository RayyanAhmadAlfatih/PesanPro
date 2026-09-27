import path from "node:path";
import type { MessageJobType, Prisma } from "@prisma/client";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { MessageJobError } from "./message-job-errors";
import { validatePublicUrl } from "./ssrf";

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

export function buildRemoteMediaContent(
  type: Exclude<MessageJobType, "TEXT">,
  remote: RemoteMediaPayload,
  caption?: string | null,
): AnyMessageContent {
  const source = { url: remote.mediaUrl };
  const common = {
    caption: caption || undefined,
    ...(remote.mimeType ? { mimetype: remote.mimeType } : {}),
  };
  if (type === "IMAGE") return { image: source, ...common };
  if (type === "VIDEO") return { video: source, ...common };
  if (type === "AUDIO") return { audio: source, mimetype: remote.mimeType, ptt: false };
  return {
    document: source,
    fileName: remoteFileName(remote),
    ...common,
    mimetype: remote.mimeType || "application/octet-stream",
  };
}
