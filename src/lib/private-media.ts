import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { MessageJobType, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { resolveTenantId } from "./billing";
import { getEnv } from "./env";
import { MessageJobError } from "./message-job-errors";
import { inspectPrivateMedia } from "./private-media-validation";
import { prisma } from "./prisma";
import { releaseStorageQuota, runWithStorageQuota } from "./storage-quota";

export type PrivateMediaActor = { id: string; role: Role; ownerId?: string | null };

export function getPrivateMediaRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), getEnv().PRIVATE_MEDIA_PATH);
}

export function resolvePrivateMediaPath(storagePath: string) {
  const root = getPrivateMediaRoot();
  const resolved = path.resolve(/* turbopackIgnore: true */ root, storagePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new MessageJobError("INVALID_MEDIA_PATH", "Media path is invalid", 500, false);
  }
  return resolved;
}

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
  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (input.buffer.length > maxBytes) throw new MessageJobError("MEDIA_TOO_LARGE", `Media exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`, 413, false);
  const inspection = inspectPrivateMedia(input.buffer, input.declaredMimeType);
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
  const absolutePath = resolvePrivateMediaPath(relativePath);
  const checksumSha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const originalName = path.basename(input.originalName || storedName).slice(0, 191);
  const expiresAt = new Date(Date.now() + env.PRIVATE_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const media = await runWithStorageQuota({
    userId: input.actor.id,
    bytes: input.buffer.length,
    sessionId: session?.sessionId ?? "tenant-media",
    filename: storedName,
  }, async () => {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer, { flag: "wx", mode: 0o600 });
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
          sizeBytes: BigInt(input.buffer.length),
          checksumSha256,
          expiresAt,
        },
      });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
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
  const buffer = await readFile(resolvePrivateMediaPath(media.storagePath)).catch(() => null);
  if (!buffer) throw new MessageJobError("MEDIA_UNAVAILABLE", "Media file is unavailable", 410, false);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (checksum !== media.checksumSha256 || BigInt(buffer.length) !== media.sizeBytes) {
    await prisma.privateMedia.update({ where: { id: media.id }, data: { status: "QUARANTINED" } });
    throw new MessageJobError("MEDIA_INTEGRITY_FAILED", "Media failed integrity validation", 410, false);
  }
  return { media, buffer };
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
  const media = await prisma.privateMedia.findFirst({ where: { id: mediaId, tenantId, status: "ACTIVE" } });
  if (!media) throw new MessageJobError("MEDIA_NOT_FOUND", "Media was not found", 404, false);
  const activeJobs = await prisma.messageJob.count({ where: { mediaId, status: { in: ["QUEUED", "PROCESSING"] } } });
  if (activeJobs > 0) throw new MessageJobError("MEDIA_IN_USE", "Media is still used by an active message", 409, false);
  const activeSchedules = await prisma.scheduledMessage.count({ where: { mediaId, status: "ACTIVE" } });
  if (activeSchedules > 0) throw new MessageJobError("MEDIA_IN_USE", "Media is still used by an active schedule", 409, false);
  await prisma.privateMedia.update({ where: { id: media.id }, data: { status: "DELETED", deletedAt: new Date() } });
  await unlink(resolvePrivateMediaPath(media.storagePath)).catch(() => undefined);
  await releaseStorageQuota({
    userId: actor.id,
    bytes: Number(media.sizeBytes),
    sessionId: media.sessionId ?? "tenant-media",
    filename: media.storedName,
  });
  return mediaDto({ ...media, status: "DELETED" });
}
