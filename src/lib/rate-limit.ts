import crypto from "crypto";
import { prisma } from "./prisma";

/**
 * In-memory sliding-window rate limiter.
 * Gate 0: single-instance in-memory. Phase 2 may move to Redis/Upstash.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
let persistentChecksSinceCleanup = 0;

// Periodic cleanup every 5 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer || typeof setInterval === "undefined") return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      // Remove timestamps outside the longest window we care about (1 hour)
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60 * 60 * 1000);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, 5 * 60 * 1000);
  // Don't prevent process exit
  if (cleanupTimer && typeof (cleanupTimer as unknown as { unref?: () => void }).unref === "function") {
    (cleanupTimer as unknown as { unref: () => void }).unref!();
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Drop expired entries
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterMs = windowMs - (now - oldest);
    return {
      success: false,
      remaining: 0,
      resetMs: oldest + windowMs,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  bucket.timestamps.push(now);
  return {
    success: true,
    remaining: limit - bucket.timestamps.length,
    resetMs: now + windowMs,
  };
}

export async function checkPersistentRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit and window must be positive integers");
  }

  const nowMs = Date.now();
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs);
  const keyHash = crypto.createHash("sha256").update(key, "utf8").digest("hex");

  await prisma.$executeRaw`
    INSERT INTO RateLimitBucket (keyHash, windowStart, count, expiresAt, updatedAt)
    VALUES (${keyHash}, ${windowStart}, 1, ${expiresAt}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      count = IF(windowStart < VALUES(windowStart), 1, count + 1),
      windowStart = VALUES(windowStart),
      expiresAt = VALUES(expiresAt),
      updatedAt = CURRENT_TIMESTAMP(3)
  `;

  const bucket = await prisma.rateLimitBucket.findUnique({ where: { keyHash }, select: { count: true } });
  persistentChecksSinceCleanup += 1;
  if (persistentChecksSinceCleanup >= 500) {
    persistentChecksSinceCleanup = 0;
    void prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  }
  const count = bucket?.count ?? limit + 1;
  const success = count <= limit;
  return {
    success,
    remaining: Math.max(0, limit - count),
    resetMs: expiresAt.getTime(),
    ...(success ? {} : { retryAfterMs: Math.max(0, expiresAt.getTime() - nowMs) }),
  };
}

/**
 * Extract client IP from NextRequest headers (x-forwarded-for aware)
 */
export function getClientIp(headers: Headers | Record<string, string | null | undefined>): string {
  const get = (name: string): string | null => {
    if (headers instanceof Headers) return headers.get(name);
    const v = (headers as Record<string, string | null | undefined>)[name];
    return v ?? null;
  };

  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
    ...(result.retryAfterMs !== undefined ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : {}),
  };
}

/** For testing — reset all buckets */
export function _resetRateLimitStore() {
  buckets.clear();
  persistentChecksSinceCleanup = 0;
}

export function _stopCleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
