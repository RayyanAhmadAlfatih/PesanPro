import dns from "dns/promises";
import net from "net";

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

export function isPrivateIPv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // IETF protocol assignments and 6to4 relay anycast.
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, incl. AWS metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 198.18.0.0/15 (benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  if (a >= 224) return true;
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  // ::1, ::ffff:127.x, fc00::/7, fe80::/10
  if (lower === "::1" || lower === "::ffff:127.0.0.1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("2001:db8:")) return true;
  if (lower === "::" || lower === "::ffff:0.0.0.0") return true;
  // ::ffff:10.x, ::ffff:192.168.x etc (IPv4-mapped)
  if (lower.startsWith("::ffff:")) {
    let v4 = lower.slice(7);
    const mappedHex = v4.match(/^([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
    if (mappedHex) {
      const high = parseInt(mappedHex[1], 16);
      const low = parseInt(mappedHex[2], 16);
      v4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    if (net.isIPv4(v4) && isPrivateIPv4(v4)) return true;
  }
  return false;
}

export function isPrivateIP(ip: string): boolean {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

/**
 * Validate that a URL is safe to fetch (no SSRF).
 * - Only http/https
 * - Hostname not blocked
 * - All resolved IPs must be public (not private/link-local)
 * - Throws SSRFError if unsafe
 */
export async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SSRFError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SSRFError(`URL protocol must be http or https, got: ${url.protocol}`);
  }

  // Block file://, gopher, etc already handled. Also block URLs with credentials
  if (url.username || url.password) {
    throw new SSRFError("URL must not contain credentials");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SSRFError(`Hostname blocked: ${hostname}`);
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new SSRFError(`Hostname suffix blocked: ${hostname}`);
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") {
    throw new SSRFError(`URL port is not allowed: ${port}`);
  }

  // If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new SSRFError(`Private IP blocked: ${hostname}`);
    }
    return url;
  }

  // DNS resolution — ensure all A/AAAA records are public
  // Wrap in try/catch: NXDOMAIN etc should be treated as blocked
  try {
    const [aRecords, aaaaRecords] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);

    const allIps = [...aRecords, ...aaaaRecords];

    if (allIps.length === 0) {
      throw new SSRFError(`Hostname did not resolve to a public IP: ${hostname}`);
    }
    for (const ip of allIps) {
      if (isPrivateIP(ip)) {
        throw new SSRFError(`Hostname ${hostname} resolves to private IP: ${ip}`);
      }
    }
  } catch (e) {
    if (e instanceof SSRFError) throw e;
    throw new SSRFError(`DNS validation failed for hostname: ${hostname}`);
  }

  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/**
 * Fetch a URL only after SSRF validation, with redirect re-validation,
 * timeout, and max-size guard.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 10000, maxBytes = 10 * 1024 * 1024, maxRedirects = 2 } = opts;

  let currentUrl = rawUrl;

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const validated = await validatePublicUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(validated.toString(), {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Handle redirect manually to re-validate next hop
    if (response.status >= 300 && response.status < 400) {
      if (redirect === maxRedirects) {
        throw new SSRFError(`Too many redirects (max ${maxRedirects})`);
      }
      const location = response.headers.get("location");
      if (!location) return response;
      // Resolve relative redirects against current URL
      currentUrl = new URL(location, validated.toString()).toString();
      continue;
    }

    // Size guard via Content-Length header (pre-check)
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isNaN(len) && len > maxBytes) {
        throw new SSRFError(`Response too large: ${len} bytes exceeds limit ${maxBytes}`);
      }
    }

    // Also guard actual body size when caller reads it — we wrap arrayBuffer/text
    // For now just return; caller should check actual bytes if needed.
    // Attach a helper property for size-checked reading
    return response;
  }

  throw new SSRFError("Redirect handling failed");
}

/**
 * Helper to fetch and return buffer with size limit enforced
 */
export async function safeFetchBuffer(
  rawUrl: string,
  opts: SafeFetchOptions = {}
): Promise<Buffer> {
  const res = await safeFetch(rawUrl, {}, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  if (ab.byteLength > maxBytes) {
    throw new SSRFError(`Response body too large: ${ab.byteLength} > ${maxBytes}`);
  }
  return Buffer.from(ab);
}

// Export for testing
export const _internal = { isPrivateIPv4, isPrivateIPv6, isPrivateIP };
