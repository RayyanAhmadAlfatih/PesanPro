import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { isPrivateIP } from "./ssrf";
import { signWebhookBody, WEBHOOK_PAYLOAD_VERSION } from "./webhook-contract";

export class WebhookTransportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "WebhookTransportError";
  }
}

export type ResolvedWebhookTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type WebhookTransportResult = {
  statusCode: number;
  responseTimeMs: number;
  responseSizeBytes: number;
};

type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type PinnedRequestResult = WebhookTransportResult & { location: string | null };
type RequestExecutor = (input: {
  target: ResolvedWebhookTarget;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxResponseBytes: number;
}) => Promise<PinnedRequestResult>;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

export async function resolveWebhookTarget(rawUrl: string, options: {
  allowInsecureHttp?: boolean;
  resolver?: Resolver;
} = {}): Promise<ResolvedWebhookTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookTransportError("INVALID_URL", "Webhook URL is invalid", false);
  }
  const allowedProtocols = options.allowInsecureHttp ? new Set(["https:", "http:"]) : new Set(["https:"]);
  if (!allowedProtocols.has(url.protocol)) {
    throw new WebhookTransportError("INSECURE_URL", "Webhook URL must use HTTPS", false);
  }
  if (url.username || url.password) {
    throw new WebhookTransportError("URL_CREDENTIALS_BLOCKED", "Webhook URL must not contain credentials", false);
  }
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if ((url.protocol === "https:" && port !== "443") || (url.protocol === "http:" && port !== "80")) {
    throw new WebhookTransportError("PORT_BLOCKED", "Webhook URL uses a forbidden port", false);
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new WebhookTransportError("HOST_BLOCKED", "Webhook hostname is not public", false);
  }
  let addresses: Array<{ address: string; family: number }>;
  if (net.isIP(hostname)) {
    addresses = [{ address: hostname, family: net.isIPv4(hostname) ? 4 : 6 }];
  } else {
    try {
      addresses = await (options.resolver ?? ((host) => dns.lookup(host, { all: true, verbatim: true })))(hostname);
    } catch {
      throw new WebhookTransportError("DNS_FAILED", "Webhook hostname could not be resolved", true);
    }
  }
  if (addresses.length === 0) throw new WebhookTransportError("DNS_FAILED", "Webhook hostname has no address", true);
  for (const entry of addresses) {
    if ((entry.family !== 4 && entry.family !== 6) || isPrivateIP(entry.address)) {
      throw new WebhookTransportError("PRIVATE_ADDRESS_BLOCKED", "Webhook hostname resolves to a non-public address", false);
    }
  }
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

const defaultRequestExecutor: RequestExecutor = ({ target, body, headers, timeoutMs, maxResponseBytes }) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const client = target.url.protocol === "https:" ? https : http;
  let settled = false;
  const finishReject = (error: Error) => {
    if (settled) return;
    settled = true;
    reject(error);
  };
  const request = client.request({
    protocol: target.url.protocol,
    hostname: target.address,
    port: target.url.port || (target.url.protocol === "https:" ? 443 : 80),
    path: `${target.url.pathname}${target.url.search}`,
    method: "POST",
    servername: target.url.hostname,
    headers: { ...headers, Host: target.url.host },
  }, (response) => {
    let bytes = 0;
    response.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxResponseBytes) {
        response.destroy(new WebhookTransportError("RESPONSE_TOO_LARGE", "Webhook response exceeded the size limit", false));
      }
    });
    response.on("error", finishReject);
    response.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({
        statusCode: response.statusCode ?? 0,
        responseTimeMs: Date.now() - startedAt,
        responseSizeBytes: bytes,
        location: response.headers.location ?? null,
      });
    });
  });
  request.setTimeout(timeoutMs, () => request.destroy(new WebhookTransportError("TIMEOUT", "Webhook request timed out", true)));
  request.on("error", (error) => {
    if (error instanceof WebhookTransportError) return finishReject(error);
    finishReject(new WebhookTransportError("NETWORK_ERROR", "Webhook endpoint could not be reached", true));
  });
  request.end(body);
});

function httpFailure(result: WebhookTransportResult) {
  const retryable = result.statusCode === 408 || result.statusCode === 425 || result.statusCode === 429 || result.statusCode >= 500;
  return new WebhookTransportError(
    `HTTP_${result.statusCode}`,
    `Webhook endpoint returned HTTP ${result.statusCode}`,
    retryable,
  );
}

export async function deliverWebhookHttp(input: {
  url: string;
  body: string;
  eventId: string;
  deliveryId: string;
  secret: string;
  previousSecret?: string | null;
  payloadVersion?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  allowInsecureHttp?: boolean;
  nowMs?: number;
  resolver?: Resolver;
  requestExecutor?: RequestExecutor;
}): Promise<WebhookTransportResult> {
  const timestamp = String(Math.floor((input.nowMs ?? Date.now()) / 1000));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(input.body)),
    "User-Agent": "PesanPro-Webhook/2.0",
    "X-PesanPro-Event-Id": input.eventId,
    "X-PesanPro-Delivery-Id": input.deliveryId,
    "X-PesanPro-Timestamp": timestamp,
    "X-PesanPro-Payload-Version": input.payloadVersion ?? WEBHOOK_PAYLOAD_VERSION,
    "X-PesanPro-Signature": `v1=${signWebhookBody(input.secret, timestamp, input.eventId, input.body)}`,
  };
  if (input.previousSecret) {
    headers["X-PesanPro-Signature-Previous"] = `v1=${signWebhookBody(input.previousSecret, timestamp, input.eventId, input.body)}`;
  }

  let currentUrl = input.url;
  const maxRedirects = input.maxRedirects ?? 2;
  const requestExecutor = input.requestExecutor ?? defaultRequestExecutor;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const target = await resolveWebhookTarget(currentUrl, { allowInsecureHttp: input.allowInsecureHttp, resolver: input.resolver });
    const result = await requestExecutor({
      target,
      body: input.body,
      headers,
      timeoutMs: input.timeoutMs ?? 10_000,
      maxResponseBytes: input.maxResponseBytes ?? 64 * 1024,
    });
    if (result.statusCode >= 300 && result.statusCode < 400) {
      if (!result.location) throw new WebhookTransportError("REDIRECT_WITHOUT_LOCATION", "Webhook redirect did not include a location", false);
      if (redirect === maxRedirects) throw new WebhookTransportError("TOO_MANY_REDIRECTS", "Webhook exceeded the redirect limit", false);
      currentUrl = new URL(result.location, target.url).toString();
      continue;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) throw httpFailure(result);
    return result;
  }
  throw new WebhookTransportError("TOO_MANY_REDIRECTS", "Webhook exceeded the redirect limit", false);
}
