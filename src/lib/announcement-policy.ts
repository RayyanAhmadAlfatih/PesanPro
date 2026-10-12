/**
 * Rules for the in-app announcement popup, kept free of Prisma so the dashboard
 * client component shares the exact parsing and gating the API enforces.
 */

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 120;
export const ANNOUNCEMENT_LINE_MAX_LENGTH = 180;
export const ANNOUNCEMENT_MAX_LINES = 4;
export const ANNOUNCEMENT_HREF_MAX_LENGTH = 2048;

/**
 * One bullet per line. A leading "-", "*", or "•" is dropped so pasting a
 * markdown list from release notes works without cleanup.
 */
export function parseAnnouncementLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

/** Blank lines removed, one bullet per line. The cap is enforced by validation. */
export function normalizeAnnouncementBody(body: string): string {
  return parseAnnouncementLines(body).join("\n");
}

/**
 * Only in-app paths. An absolute URL would turn the popup into an open
 * redirect: the "see details" button pushes whatever href it is given.
 */
export function isInternalAnnouncementHref(href: string): boolean {
  const trimmed = href.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//");
}

/**
 * A user sees the popup when a published announcement is newer than the one
 * they last dismissed. Comparing publishedAt means editing a live announcement
 * does not interrupt anyone a second time.
 */
export function shouldShowAnnouncement(
  publishedAt: Date | null,
  lastSeenAt: Date | null,
): boolean {
  if (!publishedAt) return false;
  if (!lastSeenAt) return true;
  return publishedAt.getTime() > lastSeenAt.getTime();
}
