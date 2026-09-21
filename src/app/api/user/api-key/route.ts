import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  ApiKeyLimitError,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "@/lib/api-key-service";
import { EntitlementDeniedError, SubscriptionInactiveError } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

const LEGACY_KEY_NAME = "Legacy dashboard key";

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) return null;
  return session.user;
}

async function clearLegacyKey(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: null, apiKeyPreview: null, apiKeyCreatedAt: null },
  });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await listApiKeys(user.id);
  const now = new Date();
  const key = keys.find((item) => item.name === LEGACY_KEY_NAME && !item.revokedAt) ??
    keys.find((item) => !item.revokedAt && (!item.expiresAt || item.expiresAt > now));
  return NextResponse.json({
    status: true,
    message: "API key status fetched",
    data: { hasApiKey: !!key, preview: key?.preview ?? null, createdAt: key?.createdAt ?? null },
  });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`api-key-compat:${user.id}:${ip}`, 10, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many API key operations", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitHeaders(rateLimit, 10) });
  }
  try {
    const keys = await listApiKeys(user.id);
    const existing = keys.find((item) => item.name === LEGACY_KEY_NAME && !item.revokedAt);
    const key = existing
      ? await rotateApiKey(user.id, existing.id)
      : await createApiKey({ userId: user.id, name: LEGACY_KEY_NAME });
    if (!key) return NextResponse.json({ error: "Unable to rotate API key" }, { status: 404 });

    await clearLegacyKey(user.id);
    await recordAudit({
      userId: user.id,
      userEmail: user.email ?? null,
      action: existing ? "api_key.rotate" : "api_key.create",
      resource: "api_key",
      resourceId: key.id,
      ip,
      userAgent: request.headers.get("user-agent"),
      meta: { compatibilityEndpoint: true, preview: key.preview },
    });
    return NextResponse.json({
      status: true,
      message: "API key generated",
      data: { apiKey: key.secret, preview: key.preview, createdAt: key.createdAt },
    });
  } catch (error) {
    if (error instanceof ApiKeyLimitError) {
      return NextResponse.json({ error: "API key limit reached", limit: error.limit.toString() }, { status: 409 });
    }
    if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await listApiKeys(user.id);
  const key = keys.find((item) => item.name === LEGACY_KEY_NAME && !item.revokedAt);
  if (key) await revokeApiKey(user.id, key.id);
  await clearLegacyKey(user.id);
  await recordAudit({
    userId: user.id,
    userEmail: user.email ?? null,
    action: "api_key.revoke",
    resource: "api_key",
    resourceId: key?.id ?? user.id,
    ip: getClientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    meta: { compatibilityEndpoint: true },
  });
  return NextResponse.json({ status: true, message: "API key revoked" });
}
