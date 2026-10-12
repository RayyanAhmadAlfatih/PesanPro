export interface ChangelogEntry {
  /** Release version shown in the popup header, for example "1.4.0". */
  version: string;
  /** ISO "YYYY-MM-DD". Recorded for the admin, never shown to end users. */
  date: string;
  /** false records the release but keeps it out of the sync queue. */
  announce: boolean;
  title: string;
  /** One bullet per line, the same shape the admin editor stores. */
  items: string[];
  href?: string;
}

/**
 * Code-owned release notes. `POST /api/admin/announcements/sync` imports every
 * entry with announce: true that is not in the database yet, always as a DRAFT.
 * A release therefore cannot reach users without an admin publishing it, which
 * is what keeps the popup rare enough to stay useful.
 *
 * Add entries as releases actually ship. It stays empty until one does.
 */
export const CHANGELOG: ChangelogEntry[] = [];
