import path from "node:path";
import type { MessageJobType, Prisma } from "@prisma/client";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { MessageJobError } from "./message-job-errors";
import { SSRFError, safeFetchBuffer, validatePublicUrl } from "./ssrf";

export type RemoteMediaPayload = {
  mediaUrl: string;
  fileName?: string;
  mimeType?: string;
};

/**
 * Upper bound for downloading remote media at dispatch time. It matches the
 * largest per-file upload cap of any plan, so a URL is never allowed to pull
 * in more bytes than a direct upload would accept.
 */
export const REMOTE_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

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

/**
 * Download remote media through the SSRF-guarded fetcher.
 *
 * Baileys fetches `{ url }` sources itself: it follows redirects and
 * re-resolves DNS without re-validation, so a URL that passed validation at
 * enqueue time could still land on an internal host (redirect to
 * 169.254.169.254, DNS rebinding while the job waits in the queue). Downloading
 * here keeps every hop validated and caps the buffered size.
 */
export async function fetchRemoteMediaBuffer(remote: RemoteMediaPayload): Promise<Buffer> {
  await validateRemoteMediaUrl(remote.mediaUrl);
  try {
    return await safeFetchBuffer(remote.mediaUrl, {
      timeoutMs: 60_000,
      maxBytes: REMOTE_MEDIA_MAX_BYTES,
      maxRedirects: 3,
    });
  } catch (error) {
    if (error instanceof SSRFError) {
      throw new MessageJobError("INVALID_MEDIA_URL", "Media URL must point to a public HTTP or HTTPS resource", 422, false);
    }
    throw new MessageJobError("REMOTE_MEDIA_FETCH_FAILED", "Media URL could not be downloaded", 503, true);
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
