import { Prisma } from "@prisma/client";
import { isIP } from "node:net";
import { createApiKeyRecord } from "./api-key";
import { EntitlementDeniedError, requireEntitlement, resolveTenantId } from "./billing";
import { prisma } from "./prisma";

export const API_KEY_SCOPES = [
  "device:read",
  "device:write",
  "message:read",
  "message:send",
  "media:read",
  "media:write",
  "schedule:read",
  "schedule:write",
  "broadcast:read",
  "broadcast:write",
  "campaign:read",
  "campaign:write",
  "autoreply:read",
  "autoreply:write",
  "webhook:read",
  "webhook:write",
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [...API_KEY_SCOPES];

export class ApiKeyLimitError extends Error {
  constructor(public readonly limit: bigint) {
    super("API key limit reached");
    this.name = "ApiKeyLimitError";
  }
}

export function parseApiKeyScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(API_KEY_SCOPES);
  return [...new Set(value.filter((scope): scope is ApiKeyScope => typeof scope === "string" && allowed.has(scope)))];
}

export function hasApiKeyScope(scopes: readonly string[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}

function normalizeIp(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

export function parseIpAllowlist(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("IP allowlist must be an array");
  const normalized = [...new Set(value.map((item) => typeof item === "string" ? normalizeIp(item) : ""))];
  if (normalized.length > 20 || normalized.some((item) => !isIP(item))) {
    throw new Error("IP allowlist contains an invalid address");
  }
  return normalized;
}

export function isIpAllowed(value: unknown, clientIp: string | undefined): boolean {
  const allowlist = parseIpAllowlist(value);
  return allowlist.length === 0 || (!!clientIp && allowlist.includes(normalizeIp(clientIp)));
}

function validateScopes(scopes: readonly string[]): ApiKeyScope[] {
  const parsed = parseApiKeyScopes(scopes);
  if (parsed.length === 0 || parsed.length !== new Set(scopes).size) {
    throw new Error("One or more API key scopes are invalid");
  }
  return parsed;
}

async function assertCanManageKeys(tx: Prisma.TransactionClient, userId: string) {
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!actor || actor.status !== "ACTIVE") {
    throw new EntitlementDeniedError("API_ACCESS");
  }
  await requireEntitlement(userId, "API_ACCESS", tx);
  const entitlement = await requireEntitlement(userId, "API_KEYS", tx);
  const tenantId = await resolveTenantId(userId, tx);
  if (!tenantId) throw new EntitlementDeniedError("API_KEYS");
  return { entitlement, tenantId };
}

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      preview: true,
      scopes: true,
      ipAllowlist: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createApiKey(input: {
  userId: string;
  name: string;
  scopes?: readonly string[];
  ipAllowlist?: readonly string[];
  expiresAt?: Date | null;
}) {
  const key = createApiKeyRecord();
  const scopes = validateScopes(input.scopes ?? DEFAULT_API_KEY_SCOPES);
  const ipAllowlist = parseIpAllowlist(input.ipAllowlist);

  const created = await prisma.$transaction(async (tx) => {
    const { entitlement, tenantId } = await assertCanManageKeys(tx, input.userId);
    const activeCount = await tx.apiKey.count({
      where: {
        userId: tenantId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (entitlement.limit !== null && BigInt(activeCount) >= entitlement.limit) {
      throw new ApiKeyLimitError(entitlement.limit);
    }

    return tx.apiKey.create({
      data: {
        userId: input.userId,
        name: input.name,
        keyHash: key.hashedKey,
        preview: key.preview,
        scopes,
        ipAllowlist: ipAllowlist.length > 0 ? ipAllowlist : Prisma.JsonNull,
        expiresAt: input.expiresAt,
      },
      select: { id: true, name: true, preview: true, scopes: true, ipAllowlist: true, expiresAt: true, createdAt: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { ...created, secret: key.secret };
}

export async function revokeApiKey(userId: string, keyId: string) {
  const result = await prisma.apiKey.updateMany({
    where: { id: keyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function rotateApiKey(userId: string, keyId: string) {
  const key = createApiKeyRecord();
  const rotated = await prisma.$transaction(async (tx) => {
    await assertCanManageKeys(tx, userId);
    const existing = await tx.apiKey.findFirst({ where: { id: keyId, userId, revokedAt: null } });
    if (!existing) return null;

    await tx.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    return tx.apiKey.create({
      data: {
        userId,
        name: existing.name,
        keyHash: key.hashedKey,
        preview: key.preview,
        scopes: parseApiKeyScopes(existing.scopes).length > 0
          ? parseApiKeyScopes(existing.scopes)
          : DEFAULT_API_KEY_SCOPES,
        ipAllowlist: existing.ipAllowlist ?? Prisma.JsonNull,
        expiresAt: existing.expiresAt,
      },
      select: { id: true, name: true, preview: true, scopes: true, ipAllowlist: true, expiresAt: true, createdAt: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return rotated ? { ...rotated, secret: key.secret } : null;
}
