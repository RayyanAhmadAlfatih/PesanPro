import crypto from "node:crypto";
import { IntegrationType, Prisma, type Role } from "@prisma/client";
import { canAccessSession } from "./api-auth";
import { requireEntitlement, resolveTenantId } from "./billing";
import { hashCanonicalJson } from "./canonical-json";
import { enqueueMessage } from "./message-job-service";
import { MessageJobError } from "./message-job-errors";
import { normalizeRecipient } from "./message-recipient";
import { prisma } from "./prisma";
import { getClientIp } from "./rate-limit";
import { isRecipientSuppressed } from "./suppression";
import {
  applyIntegrationMapping,
  hashIntegrationToken,
  parseIntegrationTokenScopes,
  readIntegrationToken,
  type IntegrationMessageContract,
} from "./integration-contract";

export { readIntegrationToken } from "./integration-contract";

export type IntegrationActor = { id: string; role: Role; ownerId?: string | null; email?: string | null; apiKeyId?: string };

export type IntegrationMessageInput = IntegrationMessageContract;

const INTEGRATION_PROCESSING_STALE_MS = 5 * 60 * 1000;

function generateToken() {
  return `ppint_${crypto.randomBytes(32).toString("base64url")}`;
}

function preview(token: string) {
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function publicToken<T extends {
  id: string; tenantId: string; createdById: string; sessionId: string; name: string; type: IntegrationType;
  tokenPreview: string; scopes: Prisma.JsonValue; mapping: Prisma.JsonValue | null; expiresAt: Date | null;
  revokedAt: Date | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date;
  session?: { sessionId: string; name: string };
}>(token: T) {
  return {
    id: token.id,
    tenantId: token.tenantId,
    createdById: token.createdById,
    sessionId: token.sessionId,
    sessionPublicId: token.session?.sessionId,
    sessionName: token.session?.name,
    name: token.name,
    type: token.type,
    tokenPreview: token.tokenPreview,
    scopes: parseIntegrationTokenScopes(token.scopes),
    mapping: token.mapping,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

async function tenantId(actor: IntegrationActor) {
  const value = await resolveTenantId(actor.id);
  if (!value) throw new MessageJobError("TENANT_NOT_FOUND", "Billing tenant was not found", 403, false);
  return value;
}

export async function createIntegrationToken(actor: IntegrationActor, input: {
  name: string;
  type: IntegrationType;
  sessionId: string;
  expiresAt?: Date | null;
  mapping?: Prisma.InputJsonValue;
}, headers?: Headers) {
  if (!await canAccessSession(actor.id, actor.role, input.sessionId)) {
    throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  }
  const session = await prisma.session.findUnique({ where: { sessionId: input.sessionId }, select: { id: true, sessionId: true, userId: true } });
  if (!session) throw new MessageJobError("SESSION_NOT_FOUND", "Device was not found", 404, false);
  const tenant = await tenantId(actor);
  if (session.userId !== tenant) {
    throw new MessageJobError("SESSION_FORBIDDEN", "Device was not found or is not accessible", 404, false);
  }
  await requireEntitlement(actor.id, "WEBHOOKS");
  await requireEntitlement(actor.id, "API_ACCESS");
  const rawToken = generateToken();
  const record = await prisma.integrationToken.create({
    data: {
      tenantId: tenant,
      createdById: actor.id,
      sessionId: session.id,
      name: input.name.trim(),
      type: input.type,
      tokenHash: hashIntegrationToken(rawToken),
      tokenPreview: preview(rawToken),
      scopes: ["message:send"],
      mapping: input.mapping,
      expiresAt: input.expiresAt,
    },
    include: { session: { select: { sessionId: true, name: true } } },
  });
  await prisma.auditLog.create({
    data: { userId: actor.id, userEmail: actor.email, action: "INTEGRATION_TOKEN_CREATED", resource: "INTEGRATION_TOKEN", resourceId: record.id, ip: headers ? getClientIp(headers) : null, meta: { type: record.type, sessionId: session.id } },
  });
  return { token: publicToken(record), secret: rawToken };
}

export async function listIntegrationTokens(actor: IntegrationActor) {
  const tenant = await tenantId(actor);
  const records = await prisma.integrationToken.findMany({
    where: { tenantId: tenant },
    include: { session: { select: { sessionId: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return records.map(publicToken);
}

export async function revokeIntegrationToken(actor: IntegrationActor, id: string, headers?: Headers) {
  const tenant = await tenantId(actor);
  const changed = await prisma.integrationToken.updateMany({ where: { id, tenantId: tenant, revokedAt: null }, data: { revokedAt: new Date() } });
  if (changed.count !== 1) throw new MessageJobError("INTEGRATION_TOKEN_NOT_FOUND", "Integration token was not found", 404, false);
  await prisma.auditLog.create({
    data: { userId: actor.id, userEmail: actor.email, action: "INTEGRATION_TOKEN_REVOKED", resource: "INTEGRATION_TOKEN", resourceId: id, ip: headers ? getClientIp(headers) : null },
  });
  return { id, revoked: true };
}

async function authenticateIntegration(rawToken: string, expectedType: IntegrationType) {
  const now = new Date();
  const token = await prisma.integrationToken.findUnique({
    where: { tokenHash: hashIntegrationToken(rawToken) },
    include: { creator: { select: { id: true, role: true, ownerId: true, status: true } }, session: { select: { id: true, sessionId: true } } },
  });
  if (!token || token.type !== expectedType || token.revokedAt || (token.expiresAt && token.expiresAt <= now) || token.creator.status !== "ACTIVE") {
    throw new MessageJobError("INVALID_INTEGRATION_TOKEN", "Integration token is invalid, expired, or revoked", 401, false);
  }
  if (!parseIntegrationTokenScopes(token.scopes).includes("message:send")) {
    throw new MessageJobError("INTEGRATION_SCOPE_DENIED", "Integration token cannot enqueue messages", 403, false);
  }
  await requireEntitlement(token.createdById, "WEBHOOKS");
  await requireEntitlement(token.createdById, "API_ACCESS");
  return token;
}

export async function enqueueIntegrationMessage(input: {
  rawToken: string;
  expectedType: IntegrationType;
  idempotencyKey: string;
  requestId: string;
  message: IntegrationMessageInput;
  headers: Headers;
}) {
  const token = await authenticateIntegration(input.rawToken, input.expectedType);
  const mapped = applyIntegrationMapping(token.mapping, input.message);
  const normalizedRecipient = normalizeRecipient(mapped.recipient);
  if (await isRecipientSuppressed(token.tenantId, normalizedRecipient)) {
    throw new MessageJobError("RECIPIENT_SUPPRESSED", "Recipient is on the tenant suppression list", 409, false);
  }
  const payloadHash = hashCanonicalJson({ ...mapped, recipient: normalizedRecipient });
  const existing = await prisma.integrationUsageLog.findUnique({
    where: { tokenId_idempotencyKey: { tokenId: token.id, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new MessageJobError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different payload", 409, false);
    if (existing.messageJobId) return { messageJobId: existing.messageJobId, idempotent: true, requestId: existing.requestId };
    const queued = await prisma.messageJob.findUnique({
      where: { tenantId_operation_idempotencyKey: { tenantId: token.tenantId, operation: `integration.${token.type.toLowerCase()}`, idempotencyKey: `${token.id}:${input.idempotencyKey}` } },
      select: { id: true },
    });
    if (queued) {
      await prisma.integrationUsageLog.update({ where: { id: existing.id }, data: { status: "QUEUED", messageJobId: queued.id, safeErrorCode: null } });
      return { messageJobId: queued.id, idempotent: true, requestId: existing.requestId };
    }
    if (existing.status === "PROCESSING") {
      const staleBefore = new Date(Date.now() - INTEGRATION_PROCESSING_STALE_MS);
      const recovered = await prisma.integrationUsageLog.updateMany({
        where: { id: existing.id, status: "PROCESSING", updatedAt: { lte: staleBefore } },
        data: { status: "PROCESSING", safeErrorCode: null },
      });
      if (recovered.count !== 1) {
        throw new MessageJobError("INTEGRATION_REQUEST_IN_PROGRESS", "The same integration request is still processing", 409, true);
      }
    } else {
      const reset = await prisma.integrationUsageLog.updateMany({ where: { id: existing.id, status: "FAILED" }, data: { status: "PROCESSING", safeErrorCode: null } });
      if (reset.count !== 1) throw new MessageJobError("INTEGRATION_REQUEST_IN_PROGRESS", "The same integration request is still processing", 409, true);
    }
  } else {
    try {
      await prisma.integrationUsageLog.create({
        data: {
          tokenId: token.id,
          requestId: input.requestId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          status: "PROCESSING",
          remoteIp: getClientIp(input.headers),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MessageJobError("INTEGRATION_REQUEST_IN_PROGRESS", "The same integration request is still processing", 409, true);
      }
      throw error;
    }
  }

  try {
    const result = await enqueueMessage({
      actor: { id: token.creator.id, role: token.creator.role, ownerId: token.creator.ownerId },
      operation: `integration.${token.type.toLowerCase()}`,
      idempotencyKey: `${token.id}:${input.idempotencyKey}`,
      sessionPublicId: token.session.sessionId,
      recipient: normalizedRecipient,
      type: "TEXT",
      text: mapped.message,
      priority: 10,
    });
    await prisma.$transaction([
      prisma.integrationUsageLog.update({
        where: { tokenId_idempotencyKey: { tokenId: token.id, idempotencyKey: input.idempotencyKey } },
        data: { status: "QUEUED", messageJobId: result.job.id, safeErrorCode: null },
      }),
      prisma.integrationToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }),
    ]);
    return { messageJobId: result.job.id, idempotent: result.idempotent, requestId: input.requestId };
  } catch (error) {
    const code = error instanceof MessageJobError ? error.code : "INTEGRATION_ENQUEUE_FAILED";
    await prisma.integrationUsageLog.update({
      where: { tokenId_idempotencyKey: { tokenId: token.id, idempotencyKey: input.idempotencyKey } },
      data: { status: "FAILED", safeErrorCode: code },
    }).catch(() => undefined);
    throw error;
  }
}
