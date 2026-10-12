import { prisma } from "./prisma";
import { CHANGELOG } from "./changelog";
import { normalizeAnnouncementBody, shouldShowAnnouncement } from "./announcement-policy";

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  version: string | null;
  href: string | null;
  publishedAt: string;
}

const announcementListSelect = {
  id: true,
  title: true,
  body: true,
  version: true,
  href: true,
  status: true,
  source: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { email: true } },
} as const;

/**
 * The announcement to interrupt this user with, or null. Only the newest
 * published row is considered, so a backlog of announcements never turns into a
 * queue of popups.
 */
export async function getActiveAnnouncementForUser(
  userId: string,
): Promise<ActiveAnnouncement | null> {
  const latest = await prisma.announcement.findFirst({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, body: true, version: true, href: true, publishedAt: true },
  });
  if (!latest?.publishedAt) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastSeenAnnouncementAt: true },
  });
  if (!shouldShowAnnouncement(latest.publishedAt, user?.lastSeenAnnouncementAt ?? null)) {
    return null;
  }

  return {
    id: latest.id,
    title: latest.title,
    body: latest.body,
    version: latest.version,
    href: latest.href,
    publishedAt: latest.publishedAt.toISOString(),
  };
}

/**
 * Move the dismissal watermark forward to this announcement's publishedAt.
 * The comparison lives in the WHERE clause so two open tabs cannot write an
 * older timestamp over a newer one.
 */
export async function markAnnouncementSeen(
  userId: string,
  announcementId: string,
): Promise<void> {
  const announcement = await prisma.announcement.findFirst({
    where: { id: announcementId, status: "PUBLISHED", publishedAt: { not: null } },
    select: { publishedAt: true },
  });
  if (!announcement?.publishedAt) return;

  await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { lastSeenAnnouncementAt: null },
        { lastSeenAnnouncementAt: { lt: announcement.publishedAt } },
      ],
    },
    data: { lastSeenAnnouncementAt: announcement.publishedAt },
  });
}

export async function listAnnouncements() {
  return prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    select: announcementListSelect,
  });
}

/** Changelog entries that have not been imported as drafts yet. */
export function pendingChangelogEntries() {
  const announceable = CHANGELOG.filter((entry) => entry.announce);
  return announceable;
}

export async function countPendingChangelogEntries(): Promise<number> {
  const entries = pendingChangelogEntries();
  if (entries.length === 0) return 0;

  const imported = await prisma.announcement.findMany({
    where: { source: "AUTO", version: { in: entries.map((entry) => entry.version) } },
    select: { version: true },
  });
  const known = new Set(imported.map((row) => row.version));
  return entries.filter((entry) => !known.has(entry.version)).length;
}

/**
 * Import changelog entries as drafts. Drafts, not publications: the operator
 * decides what is notable enough to interrupt people with.
 */
export async function syncChangelogAnnouncements(createdById: string) {
  const entries = pendingChangelogEntries();
  if (entries.length === 0) return { imported: 0, skipped: 0 };

  const imported = await prisma.announcement.findMany({
    where: { source: "AUTO", version: { in: entries.map((entry) => entry.version) } },
    select: { version: true },
  });
  const known = new Set(imported.map((row) => row.version));
  const pending = entries.filter((entry) => !known.has(entry.version));

  if (pending.length > 0) {
    await prisma.announcement.createMany({
      data: pending.map((entry) => ({
        title: entry.title,
        body: normalizeAnnouncementBody(entry.items.join("\n")),
        version: entry.version,
        href: entry.href ?? null,
        status: "DRAFT" as const,
        source: "AUTO" as const,
        createdById,
      })),
    });
  }

  return { imported: pending.length, skipped: entries.length - pending.length };
}
