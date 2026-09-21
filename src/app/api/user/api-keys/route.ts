import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  API_KEY_SCOPES,
  ApiKeyLimitError,
  createApiKey,
  listApiKeys,
} from "@/lib/api-key-service";
import { EntitlementDeniedError, SubscriptionInactiveError } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

const createSchema = z.object({
  name: z.string().trim().min(2).max(64),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length).optional(),
  ipAllowlist: z.array(z.string().refine((value) => isIP(value.trim()) > 0, "Invalid IP address")).max(20).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

async function currentUser() {
  const session = await auth();
  if (!session?.user?.id || session.user.accountActive === false) return null;
  return session.user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await listApiKeys(user.id);
  return NextResponse.json({
    data: keys.map((key) => ({
      ...key,
      scopes: Array.isArray(key.scopes) ? key.scopes : [],
      ipAllowlist: Array.isArray(key.ipAllowlist) ? key.ipAllowlist : [],
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = getClientIp(request.headers);
  const rateLimit = await checkPersistentRateLimit(`api-key-create:${user.id}:${ip}`, 10, 60 * 60 * 1000);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many API key operations", code: "RATE_LIMITED" }, { status: 429, headers: rateLimitHeaders(rateLimit, 10) });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid API key configuration", details: parsed.error.flatten() }, { status: 400 });
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return NextResponse.json({ error: "Expiry must be in the future" }, { status: 400 });
  }

  try {
    const key = await createApiKey({
      userId: user.id,
      name: parsed.data.name,
      scopes: parsed.data.scopes,
      ipAllowlist: parsed.data.ipAllowlist,
      expiresAt,
    });
    await recordAudit({
      userId: user.id,
      userEmail: user.email ?? null,
      action: "api_key.create",
      resource: "api_key",
      resourceId: key.id,
      ip,
      userAgent: request.headers.get("user-agent"),
      meta: { name: key.name, preview: key.preview, scopes: key.scopes, expiresAt: key.expiresAt },
    });
    return NextResponse.json({ data: key }, { status: 201 });
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
