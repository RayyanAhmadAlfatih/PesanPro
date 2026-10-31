import crypto from "node:crypto";
import path from "node:path";
import { MessageJobType, Prisma, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { resolveTenantId } from "./billing";
import { getEnv } from "./env";
import { logger } from "./logger";
import { MessageJobError } from "./message-job-errors";
import { prepareMediaForStorage } from "./media-optimization";
import { getMediaUploadPolicy, mediaTooLargeError } from "./media-upload-policy";
import { prisma } from "./prisma";
import { releaseStorageQuota, runWithStorageQuota } from "./storage-quota";
import { activePrivateMediaReferenceCounts, hasActivePrivateMediaReferences } from "./private-media-lifecycle";
import {
  deletePrivateMediaObject,
  loadPrivateMediaObject,
  storePrivateMediaObject,
} from "./private-media-storage";

export type PrivateMediaActor = { id: string; role: Role; ownerId?: string | null };

export { getPrivateMediaRoot, resolvePrivateMediaPath } from "./private-media-storage";

function mediaDto(media: {
  id: string; originalName: string; mimeType: string; mediaType: MessageJobType; sizeBytes: bigint;
  checksumSha256: string; status: string; expiresAt: Date | null; createdAt: Date;
}) {
  return {
    id: media.id,
    originalName: media.originalName,
    mimeType: media.mimeType,
    mediaType: media.mediaType,
    sizeBytes: media.sizeBytes.toString(),
    checksumSha256: media.checksumSha256,
    status: media.status,
    expiresAt: media.expiresAt,
    createdAt: media.createdAt,
  };
}

export async function storePrivateMedia(input: {
  actor: PrivateMediaActor;
  sessionPublicId?: string;
  originalName: string;
  declaredMimeType: string;
  buffer: Buffer;
}) {
  const env = getEnv();
  const policy = await getMediaUploadPolicy(input.actor.id);
  if (input.buffer.length > policy.maxUploadBytes) throw mediaTooLargeError(policy.maxUploadBytes);
  const prepared = await prepareMediaForStorage(input.buffer, input.declaredMimeType);
  if (prepared.buffer.length > policy.maxUploadBytes) throw mediaTooLargeError(policy.maxUploadBytes);
  const { inspection } = prepared;
  const tenantId = await resolveTenantId(input.actor.id);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);

  let session: { id: string; sessionId: string } | null = null;
  if (input.sessionPublicId) {
    const allowed = await canAccessSession(input.actor.id, input.actor.role, input.sessionPublicId);
    if (!allowed) throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
    session = await prisma.session.findUnique({ where: { sessionId: input.sessionPublicId }, select: { id: true, sessionId: true } });
    if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  }

  const id = crypto.randomUUID();
  const storedName = `${id}.${inspection.extension}`;
  const relativePath = `${tenantId}/${storedName}`;
  const checksumSha256 = crypto.createHash("sha256").update(prepared.buffer).digest("hex");
  const originalName = path.basename(input.originalName || storedName).slice(0, 191);
  const expiresAt = new Date(Date.now() + env.PRIVATE_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const media = await runWithStorageQuota({
    userId: input.actor.id,
    bytes: prepared.buffer.length,
    sessionId: session?.sessionId ?? "tenant-media",
    filename: storedName,
  }, async () => {
    await storePrivateMediaObject({ storagePath: relativePath, buffer: prepared.buffer, mimeType: inspection.mimeType });
    try {
      return await prisma.privateMedia.create({
        data: {
          id,
          tenantId,
          uploaderId: input.actor.id,
          sessionId: session?.id,
          originalName,
          storedName,
          storagePath: relativePath,
          mimeType: inspection.mimeType,
          mediaType: inspection.mediaType,
          extension: inspection.extension,
          sizeBytes: BigInt(prepared.buffer.length),
          checksumSha256,
          expiresAt,
        },
      });
    } catch (error) {
      await deletePrivateMediaObject({ cacheKey: id, storagePath: relativePath }).catch(() => undefined);
      throw error;
    }
  });
  return mediaDto(media);
}

export async function loadPrivateMedia(actor: PrivateMediaActor, mediaId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  const media = await prisma.privateMedia.findFirst({ where: { id: mediaId, tenantId, status: "ACTIVE" } });
  if (!media) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  const buffer = await loadPrivateMediaObject({ cacheKey: media.id, storagePath: media.storagePath });
  if (!buffer) throw new MessageJobError("MEDIA_UNAVAILABLE", "Media file is unavailable", 410, false);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (checksum !== media.checksumSha256 || BigInt(buffer.length) !== media.sizeBytes) {
    await prisma.privateMedia.update({ where: { id: media.id }, data: { status: "QUARANTINED" } });
    throw new MessageJobError("MEDIA_INTEGRITY_FAILED", "Media failed integrity validation", 410, false);
  }
  return { media, buffer };
}

export async function getPrivateMediaMetadata(actor: PrivateMediaActor, mediaId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  const media = await prisma.privateMedia.findFirst({ where: { id: mediaId, tenantId, status: "ACTIVE" } });
  if (!media) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  return mediaDto(media);
}

export async function listPrivateMedia(actor: PrivateMediaActor, limit = 50) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) return [];
  const media = await prisma.privateMedia.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, Number.isInteger(limit) ? limit : 50)),
  });
  return media.map(mediaDto);
}

export async function deletePrivateMedia(actor: PrivateMediaActor, mediaId: string) {
  const tenantId = await resolveTenantId(actor.id);
  if (!tenantId) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  const media = await prisma.$transaction(async (tx) => {
    const current = await tx.privateMedia.findFirst({ where: { id: mediaId, tenantId, status: "ACTIVE" } });
    if (!current) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
    if (hasActivePrivateMediaReferences(await activePrivateMediaReferenceCounts(tx, mediaId))) {
      throw new MessageJobError("MEDIA_IN_USE", "Media is still used by an active workflow", 409, false);
    }
    const changed = await tx.privateMedia.updateMany({
      where: { id: current.id, tenantId, status: "ACTIVE" },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (changed.count !== 1) throw new MessageJobError("MEDIA_DELETE_CONFLICT", "Media state changed while deleting", 409, true);
    return current;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  // The row is already DELETED, so a storage-delete failure must not block the
  // quota release: leaving `consumed` untouched would permanently deny the
  // tenant storage quota with no reconciliation path. Log the orphan instead.
  try {
    await deletePrivateMediaObject({ cacheKey: media.id, storagePath: media.storagePath });
  } catch (error) {
    logger.error("Media", `Failed to delete private media object ${media.id}; an orphan object may remain`, error);
  }
  await releaseStorageQuota({
    userId: media.uploaderId,
    bytes: Number(media.sizeBytes),
    sessionId: media.sessionId ?? "tenant-media",
    filename: media.storedName,
  });
  return mediaDto({ ...media, status: "DELETED" });
}
