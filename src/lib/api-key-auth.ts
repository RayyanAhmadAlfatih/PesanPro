import type { AccountStatus, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { buildApiKeyPreview, hashApiKey } from "./api-key";
import {
  DEFAULT_API_KEY_SCOPES,
  isIpAllowed,
  parseApiKeyScopes,
  type ApiKeyScope,
} from "./api-key-service";

type ApiKeyUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: AccountStatus;
  ownerId: string | null;
  sessionVersion: number;
};

type ApiKeyContext = {
  apiKeyId?: string;
  apiKeyScopes?: ApiKeyScope[];
};

type LegacyApiKeyUser = ApiKeyUser & {
  apiKey: string | null;
  apiKeyPreview: string | null;
  apiKeyCreatedAt: Date | null;
};

const apiKeyUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  ownerId: true,
  sessionVersion: true,
} as const;

const legacyApiKeyUserSelect = {
  ...apiKeyUserSelect,
  apiKey: true,
  apiKeyPreview: true,
  apiKeyCreatedAt: true,
} as const;

async function migrateLegacyPlaintextApiKey(user: LegacyApiKeyUser, rawApiKey: string): Promise<LegacyApiKeyUser> {
  const preview = user.apiKeyPreview ?? buildApiKeyPreview(rawApiKey);
  const createdAt = user.apiKeyCreatedAt ?? new Date();
  const hashedKey = hashApiKey(rawApiKey);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { apiKey: hashedKey, apiKeyPreview: preview, apiKeyCreatedAt: createdAt },
    });
  } catch (error) {
    logger.warn("Auth", "Failed to migrate legacy plaintext API key:", error);
  }
  return { ...user, apiKey: hashedKey, apiKeyPreview: preview, apiKeyCreatedAt: createdAt };
}

export async function getUserByApiKey(apiKey: string, clientIp?: string): Promise<(ApiKeyUser & ApiKeyContext) | null> {
  const hashedKey = hashApiKey(apiKey);
  const now = new Date();
  const storedKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashedKey },
    include: { user: { select: apiKeyUserSelect } },
  });
  if (
    storedKey &&
    !storedKey.revokedAt &&
    (!storedKey.expiresAt || storedKey.expiresAt > now) &&
    isIpAllowed(storedKey.ipAllowlist, clientIp) &&
    storedKey.user.status === "ACTIVE"
  ) {
    await prisma.apiKey.update({ where: { id: storedKey.id }, data: { lastUsedAt: now } });
    return { ...storedKey.user, apiKeyId: storedKey.id, apiKeyScopes: parseApiKeyScopes(storedKey.scopes) };
  }

  const user = await prisma.user.findUnique({ where: { apiKey: hashedKey }, select: legacyApiKeyUserSelect });
  if (user?.status === "ACTIVE") return { ...user, apiKeyScopes: DEFAULT_API_KEY_SCOPES };

  const legacyUser = await prisma.user.findUnique({ where: { apiKey }, select: legacyApiKeyUserSelect });
  if (!legacyUser || legacyUser.status !== "ACTIVE") return null;
  const migratedUser = await migrateLegacyPlaintextApiKey(legacyUser, apiKey);
  return {
    id: migratedUser.id,
    email: migratedUser.email,
    name: migratedUser.name,
    role: migratedUser.role,
    status: migratedUser.status,
    ownerId: migratedUser.ownerId,
    sessionVersion: migratedUser.sessionVersion,
    apiKeyScopes: DEFAULT_API_KEY_SCOPES,
  };
}
