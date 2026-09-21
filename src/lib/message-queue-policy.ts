export function calculateMessageRetryDelay(attempt: number, random = Math.random): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const baseMs = Math.min(15 * 60_000, 2_000 * (2 ** (normalizedAttempt - 1)));
  const jitter = Math.floor(baseMs * 0.2 * Math.max(0, Math.min(1, random())));
  return baseMs + jitter;
}
