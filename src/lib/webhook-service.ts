import crypto from "node:crypto";
import { Prisma, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { requireEntitlement, resolveTenantId } from "./billing";
import { MessageJobError } from "./message-job-errors";
import { prisma } from "./prisma";
import { getClientIp } from "./rate-limit";
import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from "./webhook-contract";
import { encryptWebhookSecret, generateWebhookSecret, secretPreview } from "./webhook-crypto";
import { createWebhookOutboxEvent } from "./webhook-outbox";
import { resolveWebhookTarget } from "./webhook-transport";
import { QuotaExceededError } from "./usage";

export type WebhookActor = { id: string; role: Role; ownerId?: string | null; email?: string | null };

type WebhookWriteInput = {
  name?: string;
  url?: string;
  secret?: string;
  events?: Array<WebhookEventType | "*">;
  isActive?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
};

const endpointInclude = {
  subscriptions: { where: { isActive: true }, select: { eventType: true } },
  deliveries: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, status: true, createdAt: true } },
  _count: { select: { deliveries: true } },
} as const;

function allowInsecureWebhook() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_INSECURE_WEBHOOKS === "true";
}

function ensureEvents(events: readonly string[]) {
  const allowed = new Set<string>([...WEBHOOK_EVENT_TYPES, "*"]);
  const unique = [...new Set(events)];
  if (unique.length < 1 || unique.length > 50 || unique.some((event) => !allowed.has(event))) {
    throw new MessageJobError("INVALID_WEBHOOK_EVENTS", "One or more webhook event subscriptions are invalid", 422, false);
  }
  return unique as Array<WebhookEventType | "*">;
}

function publicEndpoint<T extends {
  id: string; userId: string; tenantId: string; sessionId: string | null; name: string; url: string;
  isActive: boolean; payloadVersion: string; maxAttempts: number; timeoutMs: number; secretVersion: number;
  secretRotatedAt: Date | null; previousSecretExpiresAt: Date | null; secretCiphertext: string | null;
  createdAt: Date; updatedAt: Date; subscriptions: Array<{ eventType: string }>;
  deliveries?: Array<{ id: string; status: string; createdAt: Date }>; _count?: { deliveries: number };
}>(endpoint: T) {
  return {
    id: endpoint.id,
    userId: endpoint.userId,
    tenantId: endpoint.tenantId,
    sessionId: endpoint.sessionId,
    name: endpoint.name,
    url: endpoint.url,
    events: endpoint.subscriptions.map((item) => item.eventType),
    isActive: endpoint.isActive,
    hasSecret: Boolean(endpoint.secretCiphertext),
    secretVersion: endpoint.secretVersion,
    secretRotatedAt: endpoint.secretRotatedAt,
    previousSecretExpiresAt: endpoint.previousSecretExpiresAt,
    payloadVersion: endpoint.payloadVersion,
    maxAttempts: endpoint.maxAttempts,
    timeoutMs: endpoint.timeoutMs,
    deliveryCount: endpoint._count?.deliveries ?? 0,
    lastDelivery: endpoint.deliveries?.[0] ?? null,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

async function actorTenant(actor: WebhookActor, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const tenantId = await resolveTenantId(actor.id, client);
  if (!tenantId) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  return tenantId;
}

async function accessibleSession(actor: WebhookActor, sessionPublicId: string) {
  if (!await canAccessSession(actor.id, actor.role, sessionPublicId)) {
    throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  }
  const session = await prisma.session.findFirst({
    where: { OR: [{ id: sessionPublicId }, { sessionId: sessionPublicId }] },
    select: { id: true, sessionId: true, userId: true },
  });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  return session;
}

async function validateDestination(url: string) {
  await resolveWebhookTarget(url, { allowInsecureHttp: allowInsecureWebhook() });
}

async function audit(input: { actor: WebhookActor; action: string; resourceId: string; meta?: Prisma.InputJsonValue; headers?: Headers }) {
  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      userEmail: input.actor.email ?? null,
      action: input.action,
      resource: "WEBHOOK",
      resourceId: input.resourceId,
      ip: input.headers ? getClientIp(input.headers) : null,
      meta: input.meta,
    },
  });
}

export async function listWebhookEndpoints(actor: WebhookActor, sessionPublicId: string) {
  const [tenantId, session] = await Promise.all([actorTenant(actor), accessibleSession(actor, sessionPublicId)]);
  const endpoints = await prisma.webhook.findMany({
    where: { tenantId, OR: [{ sessionId: session.id }, { sessionId: null }] },
    include: endpointInclude,
    orderBy: { createdAt: "desc" },
  });
  return endpoints.map(publicEndpoint);
}

export async function createWebhookEndpoint(actor: WebhookActor, sessionPublicId: string, input: Required<Pick<WebhookWriteInput, "name" | "url" | "events">> & WebhookWriteInput, headers?: Headers) {
  const session = await accessibleSession(actor, sessionPublicId);
  await validateDestination(input.url);
  const events = ensureEvents(input.events);
  const secret = input.secret?.trim() || generateWebhookSecret();
  const encrypted = encryptWebhookSecret(secret);
  const endpoint = await prisma.$transaction(async (tx) => {
    const tenantId = await actorTenant(actor, tx);
    const entitlement = await requireEntitlement(actor.id, "WEBHOOKS", tx);
    const activeCount = await tx.webhook.count({ where: { tenantId, isActive: true } });
    if (entitlement.limit !== null && BigInt(activeCount) >= entitlement.limit) throw new QuotaExceededError("WEBHOOKS", entitlement.limit);
    return tx.webhook.create({
      data: {
        userId: actor.id,
        tenantId,
        sessionId: session.id,
        name: input.name.trim(),
        url: input.url,
        secret: null,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        secretRotatedAt: new Date(),
        events,
        maxAttempts: input.maxAttempts ?? 8,
        timeoutMs: input.timeoutMs ?? 10_000,
        isActive: input.isActive ?? true,
        subscriptions: { create: events.map((eventType) => ({ eventType })) },
      },
      include: endpointInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await audit({ actor, action: "WEBHOOK_CREATED", resourceId: endpoint.id, headers, meta: { sessionId: session.id, events } });
  return { endpoint: publicEndpoint(endpoint), secret, secretPreview: secretPreview(secret) };
}

async function ownedEndpoint(actor: WebhookActor, sessionPublicId: string, id: string) {
  const [tenantId, session] = await Promise.all([actorTenant(actor), accessibleSession(actor, sessionPublicId)]);
  const endpoint = await prisma.webhook.findFirst({
    where: { id, tenantId, OR: [{ sessionId: session.id }, { sessionId: null }] },
    include: endpointInclude,
  });
  if (!endpoint) throw new MessageJobError("WEBHOOK_NOT_FOUND", "Webhook endpoint was not found", 404, false);
  return endpoint;
}

export async function updateWebhookEndpoint(actor: WebhookActor, sessionPublicId: string, id: string, input: WebhookWriteInput, headers?: Headers) {
  const existing = await ownedEndpoint(actor, sessionPublicId, id);
  if (input.url && input.url !== existing.url) await validateDestination(input.url);
  const events = input.events ? ensureEvents(input.events) : null;
  if (input.isActive === true) {
    if (!existing.secretCiphertext) throw new MessageJobError("WEBHOOK_SECRET_REQUIRED", "Rotate the webhook secret before enabling this endpoint", 409, false);
    await requireEntitlement(actor.id, "WEBHOOKS");
  }
  const endpoint = await prisma.$transaction(async (tx) => {
    if (events) {
      await tx.webhookSubscription.deleteMany({ where: { webhookId: id } });
      await tx.webhookSubscription.createMany({ data: events.map((eventType) => ({ webhookId: id, eventType })) });
    }
    return tx.webhook.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(events ? { events } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      },
      include: endpointInclude,
    });
  });
  await audit({ actor, action: "WEBHOOK_UPDATED", resourceId: id, headers, meta: { fields: Object.keys(input).filter((key) => key !== "secret") } });
  return publicEndpoint(endpoint);
}

export async function rotateWebhookSecret(actor: WebhookActor, sessionPublicId: string, id: string, headers?: Headers) {
  const existing = await ownedEndpoint(actor, sessionPublicId, id);
  const secret = generateWebhookSecret();
  const encrypted = encryptWebhookSecret(secret);
  const now = new Date();
  const previousSecretExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const endpoint = await prisma.webhook.update({
    where: { id: existing.id },
    data: {
      previousSecretCiphertext: existing.secretCiphertext,
      previousSecretIv: existing.secretIv,
      previousSecretTag: existing.secretTag,
      previousSecretExpiresAt: existing.secretCiphertext ? previousSecretExpiresAt : null,
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretTag: encrypted.tag,
      secretVersion: { increment: 1 },
      secretRotatedAt: now,
      secret: null,
    },
    include: endpointInclude,
  });
  await audit({ actor, action: "WEBHOOK_SECRET_ROTATED", resourceId: id, headers, meta: { secretVersion: endpoint.secretVersion, previousSecretExpiresAt: endpoint.previousSecretExpiresAt?.toISOString() ?? null } });
  return { endpoint: publicEndpoint(endpoint), secret, secretPreview: secretPreview(secret) };
}

export async function queueWebhookTest(actor: WebhookActor, sessionPublicId: string, id: string, headers?: Headers) {
  const endpoint = await ownedEndpoint(actor, sessionPublicId, id);
  if (!endpoint.secretCiphertext) throw new MessageJobError("WEBHOOK_SECRET_REQUIRED", "Rotate the webhook secret before testing this endpoint", 409, false);
  const session = await accessibleSession(actor, sessionPublicId);
  const tenantId = await actorTenant(actor);
  const queued = await prisma.$transaction(async (tx) => {
    const event = await createWebhookOutboxEvent(tx, {
      tenantId,
      sessionDbId: session.id,
      sessionPublicId: session.sessionId,
      eventType: "test",
      eventKey: `test:${crypto.randomUUID()}`,
      data: { message: "PesanPro webhook test", requestedBy: actor.id },
    });
    const delivery = await tx.webhookDelivery.create({
      data: { eventId: event.id, webhookId: endpoint.id, deliveryKey: `${event.id}:${endpoint.id}:test`, maxAttempts: endpoint.maxAttempts },
    });
    await tx.webhookOutboxEvent.update({ where: { id: event.id }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
    return { eventId: event.id, deliveryId: delivery.id, status: delivery.status };
  });
  await audit({ actor, action: "WEBHOOK_TEST_QUEUED", resourceId: id, headers, meta: { deliveryId: queued.deliveryId } });
  return queued;
}

export async function listWebhookDeliveries(actor: WebhookActor, sessionPublicId: string, id: string, input: { limit?: number; offset?: number } = {}) {
  const endpoint = await ownedEndpoint(actor, sessionPublicId, id);
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { webhookId: endpoint.id },
      include: { event: { select: { id: true, eventType: true, payload: true, payloadVersion: true } }, attemptsLog: { orderBy: { attemptNumber: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.webhookDelivery.count({ where: { webhookId: endpoint.id } }),
  ]);
  return {
    data: deliveries.map((delivery) => ({
      id: delivery.id,
      webhookId: delivery.webhookId,
      eventId: delivery.eventId,
      event: delivery.event.eventType,
      payloadVersion: delivery.event.payloadVersion,
      status: delivery.status,
      requestUrl: endpoint.url,
      requestHeaders: { "X-PesanPro-Signature": "[REDACTED]", "X-PesanPro-Event-Id": delivery.eventId },
      requestBody: delivery.event.payload,
      responseStatusCode: delivery.responseStatusCode,
      responseBody: null,
      responseTimeMs: delivery.responseTimeMs,
      responseSizeBytes: delivery.responseSizeBytes,
      errorMessage: delivery.safeErrorMessage,
      attempts: delivery.attemptsLog,
      replayOfId: delivery.replayOfId,
      createdAt: delivery.createdAt,
    })),
    total,
    limit,
    offset,
  };
}

export async function replayWebhookDelivery(actor: WebhookActor, sessionPublicId: string, endpointId: string, deliveryId: string, headers?: Headers) {
  const endpoint = await ownedEndpoint(actor, sessionPublicId, endpointId);
  const source = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, webhookId: endpoint.id }, select: { id: true, eventId: true } });
  if (!source) throw new MessageJobError("WEBHOOK_DELIVERY_NOT_FOUND", "Webhook delivery was not found", 404, false);
  const replay = await prisma.webhookDelivery.create({
    data: {
      eventId: source.eventId,
      webhookId: endpoint.id,
      replayOfId: source.id,
      deliveryKey: `${source.eventId}:${endpoint.id}:replay:${crypto.randomUUID()}`,
      maxAttempts: endpoint.maxAttempts,
    },
  });
  await audit({ actor, action: "WEBHOOK_DELIVERY_REPLAYED", resourceId: endpoint.id, headers, meta: { sourceDeliveryId: source.id, replayDeliveryId: replay.id } });
  return { id: replay.id, eventId: replay.eventId, replayOfId: replay.replayOfId, status: replay.status };
}

export async function deleteWebhookEndpoint(actor: WebhookActor, sessionPublicId: string, id: string, headers?: Headers) {
  const endpoint = await ownedEndpoint(actor, sessionPublicId, id);
  await prisma.webhook.delete({ where: { id: endpoint.id } });
  await audit({ actor, action: "WEBHOOK_DELETED", resourceId: id, headers });
  return { id, deleted: true };
}
