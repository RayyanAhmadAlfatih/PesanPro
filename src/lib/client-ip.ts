import { isIP } from "node:net";

/**
 * Header written by our own Node server (`src/server/runtime.ts`) before the
 * request reaches Next.js. Because the server always overwrites it, a client
 * cannot forge it — unlike `x-forwarded-for`, which is fully client-controlled
 * unless a trusted reverse proxy is guaranteed to rewrite it.
 */
export const TRUSTED_CLIENT_IP_HEADER = "x-pesanpro-client-ip";

/** Canonicalize an address so allowlists and rate-limit buckets cannot be bypassed with equivalent forms. */
export function normalizeClientIp(value: string | null | undefined): string | null {
  let candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return null;

  if (candidate.startsWith("[")) {
    // "[::1]" or "[::1]:443"
    const end = candidate.indexOf("]");
    if (end === -1) return null;
    candidate = candidate.slice(1, end);
  } else {
    // Strip an IPv4 ":port" suffix without mangling a bare IPv6 address.
    const lastColon = candidate.lastIndexOf(":");
    if (lastColon !== -1 && candidate.indexOf(":") === lastColon && candidate.includes(".")) {
      candidate = candidate.slice(0, lastColon);
    }
  }

  if (isIP(candidate) === 0) return null;
  const lower = candidate.toLowerCase();
  return lower.startsWith("::ffff:") ? lower.slice(7) : lower;
}

/**
 * Derive the client IP from values the transport controls.
 *
 * - `trustProxy = false` (default): only the socket peer address is trusted, so
 *   a spoofed `x-forwarded-for` cannot influence authorization or rate limits.
 * - `trustProxy = true`: walk the forwarded chain from the right, skipping the
 *   `trustedHops` proxies we operate, so the value cannot be forged by prepending
 *   entries to the header.
 */
export function resolveTrustedClientIp(input: {
  socketAddress?: string | null;
  forwardedFor?: string | string[] | null;
  trustProxy: boolean;
  trustedHops?: number;
}): string {
  const direct = normalizeClientIp(input.socketAddress);

  if (!input.trustProxy) return direct ?? "unknown";

  const raw = Array.isArray(input.forwardedFor)
    ? input.forwardedFor.join(",")
    : input.forwardedFor ?? "";
  const chain = raw
    .split(",")
    .map((part) => normalizeClientIp(part))
    .filter((part): part is string => part !== null);

  if (chain.length === 0) return direct ?? "unknown";

  const hops = Math.max(1, Math.floor(input.trustedHops ?? 1));
  const index = chain.length - hops;
  return chain[index >= 0 ? index : 0] ?? direct ?? "unknown";
}
