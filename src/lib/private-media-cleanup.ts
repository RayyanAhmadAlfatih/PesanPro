import type { Prisma, PrivateMediaCleanup } from "@prisma/client";
import { prisma } from "./prisma";
import { deletePrivateMediaObject } from "./private-media-storage";
import { releaseStorageQuota } from "./storage-quota";

const CLEANUP_BACKOFF_BASE_MS = 30_000;
const CLEANUP_BACKOFF_MAX_MS = 6 * 60 * 60_000;

type CleanupMediaSnapshot = {
  id: string;
  tenantId: string;
  uploaderId: string;
  sessionId: string | null;
  storagePath: string;
  storedName: string;
  sizeBytes: bigint;
};

export function calculatePrivateMediaCleanupBackoffMs(attempt: number) {
  const exponent = Math.max(0, Math.min(10, attempt - 1));
  return Math.min(CLEANUP_BACKOFF_MAX_MS, CLEANUP_BACKOFF_BASE_MS * (2 ** exponent));
}

export function enqueuePrivateMediaCleanup(
  tx: Prisma.TransactionClient,
  media: CleanupMediaSnapshot,
  availableAt = new Date(),
) {
  return tx.privateMediaCleanup.create({
    data: {
      mediaId: media.id,
      tenantId: media.tenantId,
      uploaderId: media.uploaderId,
      sessionId: media.sessionId,
      storagePath: media.storagePath,
      storedName: media.storedName,
      sizeBytes: media.sizeBytes,
      availableAt,
    },
  });
}

function cleanupFailureCode(stage: string) {
  if (stage === "storage") return "STORAGE_DELETE_FAILED";
  if (stage === "storage-marker") return "STORAGE_DELETE_MARK_FAILED";
  if (stage === "quota") return "QUOTA_RELEASE_FAILED";
  if (stage === "quota-marker") return "QUOTA_RELEASE_MARK_FAILED";
  return "MEDIA_CLEANUP_FAILED";
}

async function recordCleanupFailure(cleanup: PrivateMediaCleanup, stage: string, now: Date) {
  const attempt = cleanup.attempts + 1;
  const availableAt = new Date(now.getTime() + calculatePrivateMediaCleanupBackoffMs(attempt));
  await prisma.privateMediaCleanup.updateMany({
    where: { id: cleanup.id, status: "PENDING" },
    data: {
      attempts: { increment: 1 },
      availableAt,
      safeErrorCode: cleanupFailureCode(stage),
      safeErrorMessage: "Private media cleanup will be retried",
    },
  });
  return { completed: false as const, availableAt, errorCode: cleanupFailureCode(stage) };
}

export async function finalizePrivateMediaCleanup(mediaId: string, now = new Date()) {
  const cleanup = await prisma.privateMediaCleanup.findUnique({ where: { mediaId } });
  if (!cleanup) return { completed: false as const, missing: true as const };
  if (cleanup.status === "COMPLETED") {
    return { completed: true as const, idempotent: true as const };
  }

  let stage = "storage";
  try {
    if (!cleanup.storageDeletedAt) {
      await deletePrivateMediaObject({
        cacheKey: cleanup.mediaId,
        storagePath: cleanup.storagePath,
      });
      stage = "storage-marker";
      await prisma.privateMediaCleanup.updateMany({
        where: { id: cleanup.id, status: "PENDING", storageDeletedAt: null },
        data: { storageDeletedAt: now },
      });
    }

    stage = "quota";
    if (!cleanup.quotaReleasedAt) {
      await releaseStorageQuota({
        tenantId: cleanup.tenantId,
        bytes: Number(cleanup.sizeBytes),
        sessionId: cleanup.sessionId ?? "tenant-media",
        filename: cleanup.storedName,
        idempotencyKey: `private-media-cleanup:${cleanup.mediaId}`,
      });
      stage = "quota-marker";
      await prisma.privateMediaCleanup.updateMany({
        where: { id: cleanup.id, status: "PENDING", quotaReleasedAt: null },
        data: { quotaReleasedAt: now },
      });
    }

    const completed = await prisma.privateMediaCleanup.updateMany({
      where: { id: cleanup.id, status: "PENDING" },
      data: {
        status: "COMPLETED",
        completedAt: now,
        safeErrorCode: null,
        safeErrorMessage: null,
      },
    });
    return { completed: completed.count === 1, idempotent: completed.count === 0 };
  } catch {
    return recordCleanupFailure(cleanup, stage, now);
  }
}

export async function processPendingPrivateMediaCleanup(now = new Date(), batchSize = 250) {
  const jobs = await prisma.privateMediaCleanup.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(500, Math.max(1, batchSize)),
    select: { mediaId: true },
  });

  let completed = 0;
  let pending = 0;
  for (const job of jobs) {
    const result = await finalizePrivateMediaCleanup(job.mediaId, now);
    if (result.completed) completed += 1;
    else pending += 1;
  }
  return { scanned: jobs.length, completed, pending };
}
