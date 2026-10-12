/**
 * Session lifetime policy. Kept free of Prisma and NextAuth so the Edge config
 * and the unit tests can both read it.
 */

export const DEFAULT_SESSION_TIMEOUT_HOURS = 24;
export const DEFAULT_SESSION_ABSOLUTE_MAX_HOURS = 168;
export const SESSION_TIMEOUT_HOURS_MIN = 1;
export const SESSION_TIMEOUT_HOURS_MAX = 720;
export const SESSION_ABSOLUTE_MAX_HOURS_MIN = 1;
export const SESSION_ABSOLUTE_MAX_HOURS_MAX = 2160;

const HOUR_MS = 60 * 60 * 1000;
const MAX_UPDATE_AGE_SECONDS = 60 * 60;

function parseHours(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Idle window. A session dies this long after its last refresh, so an active
 * user keeps it and an absent one loses it.
 */
export function resolveSessionTimeoutHours(raw: string | undefined): number {
  return parseHours(raw, DEFAULT_SESSION_TIMEOUT_HOURS, SESSION_TIMEOUT_HOURS_MIN, SESSION_TIMEOUT_HOURS_MAX);
}

/**
 * Hard ceiling since sign-in. Without it a rolling JWT can be renewed forever,
 * which is exactly how a session ends up lasting weeks.
 */
export function resolveSessionAbsoluteMaxHours(raw: string | undefined): number {
  return parseHours(
    raw,
    DEFAULT_SESSION_ABSOLUTE_MAX_HOURS,
    SESSION_ABSOLUTE_MAX_HOURS_MIN,
    SESSION_ABSOLUTE_MAX_HOURS_MAX,
  );
}

export function hoursToMs(hours: number): number {
  return hours * HOUR_MS;
}

/**
 * NextAuth only re-issues the token once `updateAge` has passed. If that equals
 * maxAge the token expires before it can slide, so the "idle" window would
 * behave as a hard cap instead. Capped at an hour so the idle window cannot
 * overshoot by more than that.
 */
export function sessionUpdateAgeSeconds(maxAgeSeconds: number): number {
  return Math.min(MAX_UPDATE_AGE_SECONDS, Math.max(60, Math.floor(maxAgeSeconds / 4)));
}

/**
 * A token with no start time is a session issued before the cap existed. It is
 * treated as not yet expired so the caller can stamp it and bound it from the
 * upgrade, rather than cutting every existing session off at deploy.
 */
export function isSessionAbsolutelyExpired(
  startedAtMs: number | null | undefined,
  nowMs: number,
  absoluteMaxMs: number,
): boolean {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) return false;
  return nowMs - startedAtMs >= absoluteMaxMs;
}
