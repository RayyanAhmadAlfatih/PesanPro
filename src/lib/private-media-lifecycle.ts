import { Prisma } from "@prisma/client";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { deletePrivateMediaObject } from "./private-media-storage";
import { releaseStorageQuota } from "./storage-quota";

export const PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES = {
  messageJobs: ["QUEUED", "PROCESSING", "FAILED"],
  scheduledMessages: ["ACTIVE", "FAILED"],
  broadcasts: ["DRAFT", "QUEUED", "RUNNING", "PAUSED", "FAILED"],
  campaigns: ["DRAFT", "SCHEDULED", "QUEUED", "RUNNING", "PAUSED", "FAILED"],
} as const;

export type PrivateMediaTransaction = Prisma.TransactionClient;

export async function activePrivateMediaReferenceCounts(tx: PrivateMediaTransaction, mediaId: string) {
  const [messageJobs, scheduledMessages, broadcasts, campaignVersions, autoReplies] = await Promise.all([
    tx.messageJob.count({ where: { mediaId, status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.messageJobs] } } }),
    tx.scheduledMessage.count({ where: { mediaId, status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.scheduledMessages] } } }),
    tx.broadcastLog.count({ where: { mediaId, status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.broadcasts] } } }),
    tx.campaignVersion.count({ where: { mediaId, campaign: { status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.campaigns] } } } }),
    tx.autoReply.count({ where: { mediaId, deletedAt: null } }),
  ]);
  return { messageJobs, scheduledMessages, broadcasts, campaignVersions, autoReplies };
}

export function hasActivePrivateMediaReferences(counts: Awaited<ReturnType<typeof activePrivateMediaReferenceCounts>>) {
  return Object.values(counts).some((count) => count > 0);
}

export async function lockPrivateMediaForUse(tx: PrivateMediaTransaction, tenantId: string, mediaId: string) {
  const locked = await tx.privateMedia.updateMany({
    where: { id: mediaId, tenantId, status: "ACTIVE" },
    data: { updatedAt: new Date() },
  });
  if (locked.count !== 1) throw new MessageJobError("MEDIA_NOT_FOUND", "Private media was not found", 404, false);
}

export async function purgeExpiredPrivateMedia(now = new Date(), batchSize = 100) {
  const expired = await prisma.privateMedia.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
      messageJobs: { none: { status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.messageJobs] } } },
      scheduledMessages: { none: { status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.scheduledMessages] } } },
      broadcasts: { none: { status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.broadcasts] } } },
      campaignVersions: { none: { campaign: { status: { in: [...PRIVATE_MEDIA_ACTIVE_REFERENCE_STATUSES.campaigns] } } } },
      autoReplies: { none: { deletedAt: null } },
    },
    orderBy: { expiresAt: "asc" },
    take: Math.min(500, Math.max(1, batchSize)),
  });
  let deleted = 0;
  for (const candidate of expired) {
    const claimed = await prisma.$transaction(async (tx) => {
      const current = await tx.privateMedia.findFirst({
        where: { id: candidate.id, status: "ACTIVE", expiresAt: { lte: now } },
      });
      if (!current || hasActivePrivateMediaReferences(await activePrivateMediaReferenceCounts(tx, current.id))) return null;
      const changed = await tx.privateMedia.updateMany({
        where: { id: current.id, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "DELETED", deletedAt: now },
      });
      return changed.count === 1 ? current : null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!claimed) continue;
    await deletePrivateMediaObject({ cacheKey: claimed.id, storagePath: claimed.storagePath });
    await releaseStorageQuota({
      userId: claimed.uploaderId,
      bytes: Number(claimed.sizeBytes),
      sessionId: claimed.sessionId ?? "tenant-media",
      filename: claimed.storedName,
    });
    deleted += 1;
  }
  return { deleted };
}
