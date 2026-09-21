import crypto from "node:crypto";

export const WEBHOOK_PAYLOAD_VERSION = "2026-09-04";
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export const WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.sent",
  "message.status",
  "connection.update",
  "group.update",
  "contact.update",
  "status.update",
  "group.participant",
  "message.deleted",
  "message.edited",
  "schedule.status",
  "broadcast.status",
  "campaign.status",
  "test",
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

export type WebhookPayload = {
  id: string;
  event: WebhookEventType;
  apiVersion: string;
  createdAt: string;
  sessionId: string | null;
  data: unknown;
};

export function webhookSignatureInput(timestamp: string, eventId: string, body: string) {
  return `${timestamp}.${eventId}.${body}`;
}

export function signWebhookBody(secret: string, timestamp: string, eventId: string, body: string) {
  return crypto.createHmac("sha256", secret).update(webhookSignatureInput(timestamp, eventId, body)).digest("hex");
}

function safeEqualHex(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function headerValue(headers: Headers | Record<string, string | undefined>, name: string) {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1];
}

export type WebhookVerificationResult =
  | { valid: true; eventId: string; timestamp: number }
  | { valid: false; code: "MISSING_HEADERS" | "INVALID_TIMESTAMP" | "STALE_TIMESTAMP" | "INVALID_SIGNATURE" | "REPLAY_DETECTED" };

export function verifyWebhookRequest(input: {
  body: string;
  secret: string;
  headers: Headers | Record<string, string | undefined>;
  nowMs?: number;
  toleranceSeconds?: number;
  isReplay?: (eventId: string) => boolean;
}): WebhookVerificationResult {
  const eventId = headerValue(input.headers, "x-pesanpro-event-id")?.trim();
  const timestampText = headerValue(input.headers, "x-pesanpro-timestamp")?.trim();
  const signatureHeader = headerValue(input.headers, "x-pesanpro-signature")?.trim();
  if (!eventId || !timestampText || !signatureHeader) return { valid: false, code: "MISSING_HEADERS" };
  if (!/^[A-Za-z0-9._:-]{8,191}$/.test(eventId) || !/^\d{10}$/.test(timestampText)) {
    return { valid: false, code: "INVALID_TIMESTAMP" };
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp)) return { valid: false, code: "INVALID_TIMESTAMP" };
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > (input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS)) {
    return { valid: false, code: "STALE_TIMESTAMP" };
  }
  const actual = signatureHeader.match(/^v1=([a-f0-9]{64})$/i)?.[1];
  const expected = signWebhookBody(input.secret, timestampText, eventId, input.body);
  if (!actual || !safeEqualHex(actual, expected)) return { valid: false, code: "INVALID_SIGNATURE" };
  if (input.isReplay?.(eventId)) return { valid: false, code: "REPLAY_DETECTED" };
  return { valid: true, eventId, timestamp };
}

