import crypto from "node:crypto";
import {
  Prisma,
  type Webhook,
  type WebhookDelivery,
  type WebhookOutboxEvent,
} from "@prisma/client";
import { EntitlementDeniedError, requireEntitlement, SubscriptionInactiveError } from "./billing";
import { hashCanonicalJson } from "./canonical-json";
import { checkPersistentRateLimit } from "./rate-limit";
import { prisma } from "./prisma";
import {
  decryptCurrentWebhookSecret,
  decryptPreviousWebhookSecret,
} from "./webhook-crypto";
import {
  type WebhookEventType,
  type WebhookPayload,
  WEBHOOK_PAYLOAD_VERSION,
} from "./webhook-contract";
import { deliverWebhookHttp, WebhookTransportError, type WebhookTransportResult } from "./webhook-transport";

export const DEFAULT_WEBHOOK_LEASE_MS = 30_000;
export const MAX_OUTBOX_ATTEMPTS = 5;
export const WEBHOOK_DESTINATION_RATE_PER_MINUTE = 120;

type OutboxClient = Prisma.TransactionClient | typeof prisma;
type RuntimeDelivery = WebhookDelivery & { event: WebhookOutboxEvent; webhook: Webhook };

export type ClaimedWebhookEvent = { event: WebhookOutboxEvent; claimToken: string; leaseMs: number };
export type ClaimedWebhookDelivery = { delivery: RuntimeDelivery; claimToken: string; leaseMs: number };

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Prisma.InputJsonValue;
}

function sourceIdentity(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const direct = ["eventId", "sourceMessageId", "messageId", "jobId", "scheduleId", "broadcastId", "campaignId", "id"]
    .map((key) => record[key])
    .find((value) => typeof value === "string" && value.length > 0);
  const nestedKey = record.key && typeof record.key === "object" && !Array.isArray(record.key)
    ? (record.key as Record<string, unknown>).id
    : null;
  const identity = direct ?? (typeof nestedKey === "string" ? nestedKey : null);
  if (!identity) return null;
  const state = [record.status, record.action, record.type].filter((value) => typeof value === "string").join(":");
  return `${identity}:${state}`;
}

export function buildWebhookEventKey(eventType: WebhookEventType, sessionPublicId: string | null, data: unknown, explicitKey?: string) {
  const identity = explicitKey?.trim() || sourceIdentity(data) || crypto.randomUUID();
  return `webhook:${eventType}:${hashCanonicalJson({ sessionPublicId, identity }).slice(0, 64)}`;
}

export async function createWebhookOutboxEvent(client: OutboxClient, input: {
  tenantId: string;
  sessionDbId?: string | null;
  sessionPublicId?: string | null;
  eventType: WebhookEventType;
  data: unknown;
  eventKey?: string;
  eventId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const id = input.eventId ?? `wh_evt_${crypto.randomUUID()}`;
  const payload: WebhookPayload = {
    id,
    event: input.eventType,
    apiVersion: WEBHOOK_PAYLOAD_VERSION,
    createdAt: now.toISOString(),
    sessionId: input.sessionPublicId ?? null,
    data: jsonValue(input.data),
  };
  return client.webhookOutboxEvent.create({
    data: {
      id,
      tenantId: input.tenantId,
      sessionId: input.sessionDbId ?? null,
      eventType: input.eventType,
      eventKey: buildWebhookEventKey(input.eventType, input.sessionPublicId ?? null, input.data, input.eventKey),
      payloadVersion: WEBHOOK_PAYLOAD_VERSION,
      payload: jsonValue(payload),
      maxAttempts: MAX_OUTBOX_ATTEMPTS,
      availableAt: now,
    },
  });
}

export async function publishWebhookEvent(sessionPublicId: string, eventType: WebhookEventType, data: unknown, eventKey?: string) {
  const session = await prisma.session.findUnique({ where: { sessionId: sessionPublicId }, select: { id: true, userId: true } });
  if (!session) return null;
  const identity = eventKey?.trim() || sourceIdentity(data) || crypto.randomUUID();
  const durableEventKey = buildWebhookEventKey(eventType, sessionPublicId, data, identity);
  try {
    return await createWebhookOutboxEvent(prisma, {
      tenantId: session.userId,
      sessionDbId: session.id,
      sessionPublicId,
      eventType,
      data,
      eventKey: identity,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.webhookOutboxEvent.findUnique({
        where: { tenantId_eventKey: { tenantId: session.userId, eventKey: durableEventKey } },
      });
    }
    throw error;
  }
}

export async function claimNextWebhookEvent(workerId: string, leaseMs = DEFAULT_WEBHOOK_LEASE_MS): Promise<ClaimedWebhookEvent | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  await prisma.webhookOutboxEvent.updateMany({
    where: { status: "PROCESSING", leaseExpiresAt: { lt: now }, attempts: { gte: MAX_OUTBOX_ATTEMPTS } },
    data: {
      status: "DEAD_LETTER",
      safeErrorCode: "MAX_ATTEMPTS_EXCEEDED",
      safeErrorMessage: "Webhook event materialization exceeded the retry limit",
      deadLetteredAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE WebhookOutboxEvent AS eventRow
    INNER JOIN (
      SELECT candidate.id FROM (
        SELECT id FROM WebhookOutboxEvent
        WHERE availableAt <= ${now}
          AND (status = 'PENDING' OR (status = 'PROCESSING' AND leaseExpiresAt < ${now}))
          AND attempts < maxAttempts
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = eventRow.id
    SET eventRow.status = 'PROCESSING',
        eventRow.lockedBy = ${claimToken},
        eventRow.leaseExpiresAt = ${leaseExpiresAt},
        eventRow.heartbeatAt = ${now},
        eventRow.attempts = eventRow.attempts + 1,
        eventRow.updatedAt = ${now}
    WHERE eventRow.availableAt <= ${now}
      AND (eventRow.status = 'PENDING' OR (eventRow.status = 'PROCESSING' AND eventRow.leaseExpiresAt < ${now}))
      AND eventRow.attempts < eventRow.maxAttempts
  `);
  if (claimed !== 1) return null;
  const event = await prisma.webhookOutboxEvent.findFirst({ where: { status: "PROCESSING", lockedBy: claimToken } });
  return event ? { event, claimToken, leaseMs } : null;
}

export function heartbeatWebhookEvent(id: string, claimToken: string, leaseMs = DEFAULT_WEBHOOK_LEASE_MS) {
  const now = new Date();
  return prisma.webhookOutboxEvent.updateMany({
    where: { id, status: "PROCESSING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

export async function materializeClaimedWebhookEvent(claim: ClaimedWebhookEvent) {
  try {
    await requireEntitlement(claim.event.tenantId, "WEBHOOKS");
  } catch (error) {
    if (!(error instanceof EntitlementDeniedError) && !(error instanceof SubscriptionInactiveError)) throw error;
    const updated = await prisma.webhookOutboxEvent.updateMany({
      where: { id: claim.event.id, status: "PROCESSING", lockedBy: claim.claimToken },
      data: {
        status: "DISPATCHED",
        safeErrorCode: "ENTITLEMENT_DENIED",
        safeErrorMessage: "Webhook delivery is disabled for this subscription",
        dispatchedAt: new Date(),
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    return { action: updated.count === 1 ? "SKIPPED" as const : "CLAIM_LOST" as const, deliveries: 0 };
  }

  const endpoints = await prisma.webhook.findMany({
    where: {
      tenantId: claim.event.tenantId,
      isActive: true,
      secretCiphertext: { not: null },
      OR: [{ sessionId: null }, { sessionId: claim.event.sessionId }],
      subscriptions: { some: { isActive: true, eventType: { in: [claim.event.eventType, "*"] } } },
    },
    select: { id: true, maxAttempts: true },
  });
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const owned = await tx.webhookOutboxEvent.findFirst({
      where: { id: claim.event.id, status: "PROCESSING", lockedBy: claim.claimToken },
      select: { id: true },
    });
    if (!owned) return { action: "CLAIM_LOST" as const, deliveries: 0 };
    if (endpoints.length > 0) {
      await tx.webhookDelivery.createMany({
        data: endpoints.map((endpoint) => ({
          eventId: claim.event.id,
          webhookId: endpoint.id,
          deliveryKey: `${claim.event.id}:${endpoint.id}:initial`,
          maxAttempts: endpoint.maxAttempts,
          availableAt: now,
        })),
        skipDuplicates: true,
      });
    }
    await tx.webhookOutboxEvent.update({
      where: { id: claim.event.id },
      data: { status: "DISPATCHED", dispatchedAt: now, lockedBy: null, leaseExpiresAt: null, heartbeatAt: null, safeErrorCode: null, safeErrorMessage: null },
    });
    return { action: "DISPATCHED" as const, deliveries: endpoints.length };
  });
  return result;
}

export function calculateWebhookBackoffMs(attempt: number, seed: string, baseMs = 2_000, maxMs = 15 * 60_000) {
  const exponent = Math.max(0, Math.min(12, attempt - 1));
  const raw = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = parseInt(crypto.createHash("sha256").update(`${seed}:${attempt}`).digest("hex").slice(0, 8), 16) / 0xffffffff;
  return Math.max(baseMs, Math.floor(raw * (0.8 + jitter * 0.4)));
}

export async function failClaimedWebhookEvent(claim: ClaimedWebhookEvent, error: unknown) {
  const terminal = claim.event.attempts >= claim.event.maxAttempts;
  const now = new Date();
  const retryAt = new Date(now.getTime() + calculateWebhookBackoffMs(claim.event.attempts, claim.event.id));
  const updated = await prisma.webhookOutboxEvent.updateMany({
    where: { id: claim.event.id, status: "PROCESSING", lockedBy: claim.claimToken },
    data: terminal ? {
      status: "DEAD_LETTER",
      safeErrorCode: "OUTBOX_MATERIALIZATION_FAILED",
      safeErrorMessage: "Webhook event could not be materialized",
      deadLetteredAt: now,
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    } : {
      status: "PENDING",
      availableAt: retryAt,
      safeErrorCode: "OUTBOX_MATERIALIZATION_FAILED",
      safeErrorMessage: error instanceof Error ? error.message.slice(0, 500) : "Webhook event materialization failed",
      lockedBy: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
    },
  });
  return { retrying: !terminal && updated.count === 1, code: "OUTBOX_MATERIALIZATION_FAILED" };
}

export async function claimNextWebhookDelivery(workerId: string, leaseMs = DEFAULT_WEBHOOK_LEASE_MS): Promise<ClaimedWebhookDelivery | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isInteger(leaseMs) || leaseMs < 5_000) throw new Error("leaseMs must be at least 5000");
  const now = new Date();
  await prisma.$executeRaw(Prisma.sql`
    UPDATE WebhookDelivery
    SET status = 'DEAD_LETTER',
        safeErrorCode = 'MAX_ATTEMPTS_EXCEEDED',
        safeErrorMessage = 'Webhook delivery exceeded the retry limit',
        deadLetteredAt = ${now},
        lockedBy = NULL,
        leaseExpiresAt = NULL,
        heartbeatAt = NULL,
        updatedAt = ${now}
    WHERE status = 'PROCESSING'
      AND leaseExpiresAt < ${now}
      AND attempts >= maxAttempts
  `);
  const claimToken = `${workerId}:${crypto.randomUUID()}`;
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE WebhookDelivery AS deliveryRow
    INNER JOIN (
      SELECT candidate.id FROM (
        SELECT id FROM WebhookDelivery
        WHERE availableAt <= ${now}
          AND (status IN ('PENDING', 'RETRYING') OR (status = 'PROCESSING' AND leaseExpiresAt < ${now}))
          AND attempts < maxAttempts
        ORDER BY availableAt ASC, createdAt ASC
        LIMIT 1
      ) AS candidate
    ) AS selected ON selected.id = deliveryRow.id
    SET deliveryRow.status = 'PROCESSING',
        deliveryRow.lockedBy = ${claimToken},
        deliveryRow.leaseExpiresAt = ${leaseExpiresAt},
        deliveryRow.heartbeatAt = ${now},
        deliveryRow.lastAttemptAt = ${now},
        deliveryRow.attempts = deliveryRow.attempts + 1,
        deliveryRow.updatedAt = ${now}
    WHERE deliveryRow.availableAt <= ${now}
      AND (deliveryRow.status IN ('PENDING', 'RETRYING') OR (deliveryRow.status = 'PROCESSING' AND deliveryRow.leaseExpiresAt < ${now}))
      AND deliveryRow.attempts < deliveryRow.maxAttempts
  `);
  if (claimed !== 1) return null;
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { status: "PROCESSING", lockedBy: claimToken },
    include: { event: true, webhook: true },
  }) as RuntimeDelivery | null;
  return delivery ? { delivery, claimToken, leaseMs } : null;
}

export function heartbeatWebhookDelivery(id: string, claimToken: string, leaseMs = DEFAULT_WEBHOOK_LEASE_MS) {
  const now = new Date();
  return prisma.webhookDelivery.updateMany({
    where: { id, status: "PROCESSING", lockedBy: claimToken },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
  });
}

type WebhookDeliverer = (input: Parameters<typeof deliverWebhookHttp>[0]) => Promise<WebhookTransportResult>;

export async function executeClaimedWebhookDelivery(claim: ClaimedWebhookDelivery, deliverer: WebhookDeliverer = deliverWebhookHttp) {
  const attemptNumber = claim.delivery.attempts;
  await prisma.webhookDeliveryAttempt.upsert({
    where: { deliveryId_attemptNumber: { deliveryId: claim.delivery.id, attemptNumber } },
    create: { deliveryId: claim.delivery.id, attemptNumber, workerId: claim.claimToken },
    update: { workerId: claim.claimToken, status: "PROCESSING", finishedAt: null, safeErrorCode: null, safeErrorMessage: null },
  });
  if (!claim.delivery.webhook.isActive) {
    const now = new Date();
    await prisma.$transaction([
      prisma.webhookDeliveryAttempt.update({
        where: { deliveryId_attemptNumber: { deliveryId: claim.delivery.id, attemptNumber } },
        data: { status: "FAILED", safeErrorCode: "ENDPOINT_DISABLED", safeErrorMessage: "Webhook endpoint is disabled", finishedAt: now },
      }),
      prisma.webhookDelivery.update({
        where: { id: claim.delivery.id },
        data: { status: "CANCELLED", safeErrorCode: "ENDPOINT_DISABLED", safeErrorMessage: "Webhook endpoint is disabled", lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
      }),
    ]);
    return { action: "CANCELLED" as const };
  }
  await requireEntitlement(claim.delivery.webhook.tenantId, "WEBHOOKS");
  const destination = new URL(claim.delivery.webhook.url).hostname.toLowerCase();
  const rate = await checkPersistentRateLimit(`webhook-destination:${destination}`, WEBHOOK_DESTINATION_RATE_PER_MINUTE, 60_000);
  if (!rate.success) {
    throw new WebhookTransportError("DESTINATION_RATE_LIMITED", "Webhook destination rate limit reached", true, rate.retryAfterMs);
  }
  const secret = decryptCurrentWebhookSecret(claim.delivery.webhook);
  const previousSecret = decryptPreviousWebhookSecret(claim.delivery.webhook);
  const result = await deliverer({
    url: claim.delivery.webhook.url,
    body: JSON.stringify(claim.delivery.event.payload),
    eventId: claim.delivery.event.id,
    deliveryId: claim.delivery.id,
    secret,
    previousSecret,
    payloadVersion: claim.delivery.event.payloadVersion,
    timeoutMs: claim.delivery.webhook.timeoutMs,
    maxResponseBytes: 64 * 1024,
    maxRedirects: 2,
    allowInsecureHttp: process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_WEBHOOKS === "true",
  });
  const now = new Date();
  const completed = await prisma.$transaction(async (tx) => {
    const updated = await tx.webhookDelivery.updateMany({
      where: { id: claim.delivery.id, status: "PROCESSING", lockedBy: claim.claimToken },
      data: {
        status: "SUCCEEDED",
        responseStatusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        responseSizeBytes: result.responseSizeBytes,
        safeErrorCode: null,
        safeErrorMessage: null,
        succeededAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (updated.count !== 1) return false;
    await tx.webhookDeliveryAttempt.update({
      where: { deliveryId_attemptNumber: { deliveryId: claim.delivery.id, attemptNumber } },
      data: { status: "SUCCEEDED", responseStatusCode: result.statusCode, responseTimeMs: result.responseTimeMs, responseSizeBytes: result.responseSizeBytes, finishedAt: now },
    });
    return true;
  });
  return { action: completed ? "SUCCEEDED" as const : "CLAIM_LOST" as const, result };
}

function deliveryFailure(error: unknown) {
  if (error instanceof WebhookTransportError) {
    return { code: error.code, message: error.message.slice(0, 500), retryable: error.retryable, retryAfterMs: error.retryAfterMs };
  }
  if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
    return { code: "ENTITLEMENT_DENIED", message: "Webhook delivery is disabled for this subscription", retryable: false };
  }
  return { code: "DELIVERY_FAILED", message: "Webhook delivery failed", retryable: true };
}

export async function failClaimedWebhookDelivery(claim: ClaimedWebhookDelivery, error: unknown) {
  const failure = deliveryFailure(error);
  const terminal = !failure.retryable || claim.delivery.attempts >= claim.delivery.maxAttempts;
  const now = new Date();
  const retryDelay = failure.retryAfterMs ?? calculateWebhookBackoffMs(claim.delivery.attempts, claim.delivery.id);
  const retryAt = new Date(now.getTime() + retryDelay);
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.webhookDelivery.updateMany({
      where: { id: claim.delivery.id, status: "PROCESSING", lockedBy: claim.claimToken },
      data: terminal ? {
        status: "DEAD_LETTER",
        safeErrorCode: failure.code,
        safeErrorMessage: failure.message,
        deadLetteredAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      } : {
        status: "RETRYING",
        availableAt: retryAt,
        safeErrorCode: failure.code,
        safeErrorMessage: failure.message,
        lockedBy: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      },
    });
    if (updated.count !== 1) return false;
    await tx.webhookDeliveryAttempt.updateMany({
      where: { deliveryId: claim.delivery.id, attemptNumber: claim.delivery.attempts, status: "PROCESSING" },
      data: { status: "FAILED", safeErrorCode: failure.code, safeErrorMessage: failure.message, finishedAt: now },
    });
    return true;
  });
  return { retrying: changed && !terminal, code: failure.code, retryAt: changed && !terminal ? retryAt : null };
}

export async function recoverWebhookClaimsForWorker(workerId: string) {
  const now = new Date();
  const prefix = `${workerId}:`;
  return prisma.$transaction(async (tx) => {
    const deliveryClaims = await tx.webhookDelivery.findMany({
      where: { status: "PROCESSING", lockedBy: { startsWith: prefix } },
      select: { id: true, attempts: true },
    });
    for (const delivery of deliveryClaims) {
      await tx.webhookDeliveryAttempt.updateMany({
        where: { deliveryId: delivery.id, attemptNumber: delivery.attempts, status: "PROCESSING" },
        data: { status: "FAILED", safeErrorCode: "WORKER_SHUTDOWN", safeErrorMessage: "Worker stopped before delivery completed", finishedAt: now },
      });
    }
    const deliveries = await tx.webhookDelivery.updateMany({
      where: { status: "PROCESSING", lockedBy: { startsWith: prefix } },
      data: { status: "RETRYING", availableAt: now, safeErrorCode: "WORKER_SHUTDOWN", safeErrorMessage: "Worker stopped before delivery completed", lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
    });
    const events = await tx.webhookOutboxEvent.updateMany({
      where: { status: "PROCESSING", lockedBy: { startsWith: prefix } },
      data: { status: "PENDING", availableAt: now, safeErrorCode: "WORKER_SHUTDOWN", safeErrorMessage: "Worker stopped before event materialization completed", lockedBy: null, leaseExpiresAt: null, heartbeatAt: null },
    });
    return { deliveries: deliveries.count, events: events.count };
  });
}
