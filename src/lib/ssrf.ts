import dns from "node:dns/promises";
import http, { type IncomingHttpHeaders, type RequestOptions } from "node:http";
import https from "node:https";
import net from "node:net";

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

export type PublicFetchErrorCode =
  | "REMOTE_FETCH_TIMEOUT"
  | "REMOTE_FETCH_TOO_LARGE"
  | "REMOTE_FETCH_NETWORK"
  | "REMOTE_FETCH_HTTP_STATUS"
  | "REMOTE_FETCH_REDIRECT"
  | "REMOTE_FETCH_ENCODING";

export class PublicFetchError extends Error {
  constructor(
    public readonly code: PublicFetchErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "PublicFetchError";
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
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::ffff:127.0.0.1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("2001:db8:")) return true;
  if (lower === "::" || lower === "::ffff:0.0.0.0") return true;
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

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function validateUrlStructure(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SSRFError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SSRFError("URL protocol must be http or https");
  }
  if (url.username || url.password) {
    throw new SSRFError("URL must not contain credentials");
  }

  const hostname = normalizedHostname(url);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SSRFError("Hostname is blocked");
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new SSRFError("Hostname suffix is blocked");
  }

  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") {
    throw new SSRFError("URL port is not allowed");
  }
  if (net.isIP(hostname) && isPrivateIP(hostname)) {
    throw new SSRFError("Private IP is blocked");
  }
  return url;
}

export type PublicAddress = { address: string; family: 4 | 6 };
type PublicResolver = (hostname: string) => Promise<PublicAddress[]>;

async function resolvePublicAddresses(hostname: string): Promise<PublicAddress[]> {
  const directFamily = net.isIP(hostname);
  if (directFamily) {
    if (isPrivateIP(hostname)) throw new SSRFError("Private IP is blocked");
    return [{ address: hostname, family: directFamily as 4 | 6 }];
  }

  let records: Awaited<ReturnType<typeof dns.lookup>>;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SSRFError("Hostname did not resolve");
  }
  if (records.length === 0) throw new SSRFError("Hostname did not resolve");

  const addresses = records.map((record) => ({
    address: record.address,
    family: record.family as 4 | 6,
  }));
  if (addresses.some((record) => isPrivateIP(record.address))) {
    throw new SSRFError("Hostname resolves to a private or reserved IP");
  }
  return addresses;
}

export async function validatePublicUrl(rawUrl: string): Promise<URL> {
  const url = validateUrlStructure(rawUrl);
  await resolvePublicAddresses(normalizedHostname(url));
  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {},
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

    if (response.status >= 300 && response.status < 400) {
      if (redirect === maxRedirects) {
        throw new SSRFError(`Too many redirects (max ${maxRedirects})`);
      }
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, validated.toString()).toString();
      continue;
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isNaN(len) && len > maxBytes) {
        throw new SSRFError(`Response too large: ${len} bytes exceeds limit ${maxBytes}`);
      }
    }
    return response;
  }

  throw new SSRFError("Redirect handling failed");
}

export async function safeFetchBuffer(
  rawUrl: string,
  opts: SafeFetchOptions = {},
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

type PinnedResponse = {
  statusCode: number;
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy?: () => void;
};

type PinnedRequester = (
  url: URL,
  address: PublicAddress,
  signal: AbortSignal,
) => Promise<PinnedResponse>;

function requestPinned(url: URL, address: PublicAddress, signal: AbortSignal): Promise<PinnedResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const hostname = normalizedHostname(url);
  const options: RequestOptions = {
    protocol: url.protocol,
    hostname: address.address,
    family: address.family,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    method: "GET",
    path: `${url.pathname}${url.search}`,
    headers: {
      Host: url.host,
      Accept: "*/*",
      "Accept-Encoding": "identity",
      "User-Agent": "PesanPro/remote-media",
    },
    signal,
    ...(url.protocol === "https:" && !net.isIP(hostname) ? { servername: hostname } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(options, (response) => {
      resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: response,
        destroy: () => response.destroy(),
      });
    });
    request.once("error", reject);
    request.end();
  });
}

function firstHeader(headers: PinnedResponse["headers"], name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeContentType(value: string | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase() || null;
}

function timeoutError() {
  return new PublicFetchError("REMOTE_FETCH_TIMEOUT", "Remote media fetch timed out", true);
}

async function withDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError();

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError()), remaining);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchPublicBufferWithDependencies(
  rawUrl: string,
  opts: SafeFetchOptions,
  dependencies: { resolve: PublicResolver; request: PinnedRequester },
) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be a positive integer");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("maxBytes must be a positive integer");
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) throw new Error("maxRedirects is invalid");

  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
  abortTimer.unref?.();
  let currentUrl = rawUrl;

  try {
    for (let redirect = 0; redirect <= maxRedirects; redirect++) {
      const url = validateUrlStructure(currentUrl);
      const hostname = normalizedHostname(url);
      const addresses = await withDeadline(dependencies.resolve(hostname), deadline);
      if (addresses.length === 0 || addresses.some((entry) => isPrivateIP(entry.address))) {
        throw new SSRFError("Hostname resolves to a private, reserved, or empty address set");
      }

      const address = addresses[0];
      let response: PinnedResponse;
      try {
        response = await withDeadline(dependencies.request(url, address, controller.signal), deadline);
      } catch (error) {
        if (error instanceof SSRFError || error instanceof PublicFetchError) throw error;
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw timeoutError();
        throw new PublicFetchError("REMOTE_FETCH_NETWORK", "Remote media could not be fetched", true);
      }

      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.destroy?.();
        if (redirect === maxRedirects) {
          throw new PublicFetchError("REMOTE_FETCH_REDIRECT", "Remote media redirected too many times", false);
        }
        const location = firstHeader(response.headers, "location");
        if (!location) {
          throw new PublicFetchError("REMOTE_FETCH_REDIRECT", "Remote media redirect is missing a location", false);
        }
        currentUrl = new URL(location, url).toString();
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy?.();
        const retryable = response.statusCode === 408 || response.statusCode === 425 || response.statusCode === 429 || response.statusCode >= 500;
        throw new PublicFetchError(
          "REMOTE_FETCH_HTTP_STATUS",
          "Remote media server returned an unusable response",
          retryable,
          response.statusCode,
        );
      }

      const encoding = firstHeader(response.headers, "content-encoding")?.trim().toLowerCase();
      if (encoding && encoding !== "identity") {
        response.destroy?.();
        throw new PublicFetchError("REMOTE_FETCH_ENCODING", "Compressed remote media responses are not accepted", false);
      }

      const declaredLength = Number(firstHeader(response.headers, "content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy?.();
        throw new PublicFetchError("REMOTE_FETCH_TOO_LARGE", "Remote media exceeds the configured size limit", false);
      }

      const chunks: Buffer[] = [];
      let total = 0;
      try {
        for await (const chunk of response.body) {
          if (controller.signal.aborted) throw timeoutError();
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buffer.length;
          if (total > maxBytes) {
            response.destroy?.();
            throw new PublicFetchError("REMOTE_FETCH_TOO_LARGE", "Remote media exceeds the configured size limit", false);
          }
          chunks.push(buffer);
        }
      } catch (error) {
        if (error instanceof PublicFetchError) throw error;
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw timeoutError();
        throw new PublicFetchError("REMOTE_FETCH_NETWORK", "Remote media transfer failed", true);
      }

      return {
        buffer: Buffer.concat(chunks, total),
        contentType: normalizeContentType(firstHeader(response.headers, "content-type")),
        finalUrl: url.toString(),
      };
    }
  } finally {
    clearTimeout(abortTimer);
  }

  throw new PublicFetchError("REMOTE_FETCH_REDIRECT", "Remote media redirect handling failed", false);
}

export function fetchPublicBuffer(rawUrl: string, opts: SafeFetchOptions = {}) {
  return fetchPublicBufferWithDependencies(rawUrl, opts, {
    resolve: resolvePublicAddresses,
    request: requestPinned,
  });
}

export const _internal = {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateIP,
  fetchPublicBufferWithDependencies,
};
