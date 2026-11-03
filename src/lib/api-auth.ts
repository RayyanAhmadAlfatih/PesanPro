import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";
import type { ApiKeyScope } from "./api-key-service";
import { getClientIp } from "./rate-limit";
import { getRequiredApiScope } from "./api-scope-policy";
import { getUserByApiKey } from "./api-key-auth";
import { isActiveAccountRole, isSuperadmin } from "./access-policy";

export { getRequiredApiScope } from "./api-scope-policy";
export { getUserByApiKey } from "./api-key-auth";

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    SUPERADMIN: 2,
    USER: 1,
} as const;

type RequiredRole = keyof typeof ROLE_HIERARCHY;

const authUserSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    status: true,
    ownerId: true,
    sessionVersion: true,
} as const;

export const safeBotConfigSelect = {
    id: true,
    sessionId: true,
    enabled: true,
    botName: true,
    botMode: true,
    botAllowedJids: true,
    botBlockedJids: true,
    autoReplyMode: true,
    autoReplyAllowedJids: true,
    autoReplyBlockedJids: true,
    enableSticker: true,
    enableVideoSticker: true,
    maxStickerDuration: true,
    enablePing: true,
    enableUptime: true,
    prefix: true,
    antiSpamEnabled: true,
    spamLimit: true,
    spamInterval: true,
    spamDelayMin: true,
    spamDelayMax: true,
    welcomeMessage: true,
    autoRead: true,
    alwaysOnline: true,
    createdAt: true,
    updatedAt: true,
} as const;

export const safeWebhookSelect = {
    id: true,
    userId: true,
    sessionId: true,
    name: true,
    url: true,
    events: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

export function canUseApiScope(
    user: { authMethod?: "apiKey" | "session"; apiKeyScopes?: ApiKeyScope[] },
    scope: ApiKeyScope,
): boolean {
    return user.authMethod !== "apiKey" || (user.apiKeyScopes?.includes(scope) ?? false);
}

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostFromUrl(value: string): string | null {
    try {
        return new URL(value).host.toLowerCase() || null;
    } catch {
        return null;
    }
}

/**
 * Cookie-authenticated (dashboard) state-changing requests must originate from
 * the app itself. A browser attaches the session cookie to every request to
 * this site — including cross-site requests crafted by another website — so
 * without an origin check any third-party page could drive messaging APIs on
 * behalf of a logged-in tenant (classic CSRF). Browsers send `Origin` on
 * state-changing fetches and `Sec-Fetch-Site` on all navigations/fetches, so a
 * legitimate same-origin dashboard request always passes; API-key requests
 * never reach this check and external integrations keep working from any
 * origin.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
    if (SAFE_HTTP_METHODS.has(request.method)) return true;

    // Modern browsers declare the request context. A browser-labelled
    // cross-site request is rejected even if an Origin header was stripped.
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    if (fetchSite === "cross-site" || fetchSite === "null") return false;

    const allowedHosts = new Set<string>();
    const host = request.headers.get("host")?.trim().toLowerCase();
    if (host) allowedHosts.add(host);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedHost) allowedHosts.add(forwardedHost);
    // The URL host is the app's own host by definition; include it so the
    // check also works where the Host header is not populated explicitly.
    const urlHost = request.nextUrl.host?.toLowerCase();
    if (urlHost) allowedHosts.add(urlHost);

    const origin = request.headers.get("origin")?.trim();
    if (origin) {
        // Sandboxed iframes send the literal string "null" — never same-origin.
        if (origin === "null") return false;
        const originHost = hostFromUrl(origin);
        if (!originHost || allowedHosts.size === 0 || !allowedHosts.has(originHost)) return false;
        return true;
    }

    const referer = request.headers.get("referer")?.trim();
    if (referer) {
        const refererHost = hostFromUrl(referer);
        if (!refererHost || allowedHosts.size === 0 || !allowedHosts.has(refererHost)) return false;
    }

    // No Origin/Referer at all: browsers attach at least one of them to
    // state-changing requests, so an absent pair means a non-browser client
    // (server-to-server, curl) that explicitly presents the cookie. That is
    // not a CSRF vector — CSRF requires a browser to attach cookies silently.
    return true;
}

/**
 * Validate API key from request header
 */
export async function validateApiKey(request: NextRequest) {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
        return null;
    }

    try {
        return await getUserByApiKey(apiKey, getClientIp(request.headers));
    } catch (error) {
        // A database failure must not masquerade as a bad key: a valid key
        // would receive a misleading 401 and the outage would hide behind
        // client-side retries. Re-throw so routes answer 500 with a request id.
        logger.error("Auth", "API key validation error:", error);
        throw error;
    }
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    // A request that presents an API key declares itself an API request. When
    // the key is invalid, expired, IP-blocked, or lacks the required scope it
    // must fail closed: falling through to session auth would silently discard
    // the key's restrictions (scope, IP allowlist, revocation) whenever the
    // caller also holds a dashboard cookie.
    if (request && request.headers.get("x-api-key")) {
        const apiKeyUser = await validateApiKey(request);
        if (!apiKeyUser) return null;
        const requiredScope = getRequiredApiScope(request.method, request.nextUrl.pathname);
        // A valid API key that lacks the required scope must fail closed.
        if (!requiredScope) return null;
        if (!apiKeyUser.apiKeyScopes?.includes(requiredScope)) return null;
        return { ...apiKeyUser, authMethod: "apiKey" as const };
    }

    // Fall back to session auth
    const session = await auth();
    if (session?.user?.id) {
        // CSRF defence: a browser sends the session cookie on cross-site
        // requests too, so cookie-authenticated state-changing requests must
        // originate from this app. API-key requests never reach this branch.
        if (request && !isSameOriginRequest(request)) {
            logger.warn("Auth", "Rejected cookie-authenticated request with foreign origin", {
                path: request.nextUrl.pathname,
                origin: request.headers.get("origin"),
                fetchSite: request.headers.get("sec-fetch-site"),
            });
            return null;
        }
        // Fetch full user data including role
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: authUserSelect
        });

        if (user?.status === "ACTIVE" && user.sessionVersion === session.user.sessionVersion) {
            return { ...user, apiKeyId: undefined, apiKeyScopes: undefined, authMethod: "session" as const };
        }
    }

    return null;
}

/**
 * Check if user has required role level
 */
export function hasRole(userRole: string, requiredRole: RequiredRole): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as RequiredRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is admin (SUPERADMIN or has admin privileges)
 */
export function isAdmin(userRole: string): boolean {
    return isSuperadmin(userRole);
}

/**
 * Check if user can access a session
 * Operational device data is always tenant-owned. A superadmin can use
 * sessions owned by their own account, but the role never bypasses ownership.
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (!isActiveAccountRole(userRole)) return false;

    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, ownerId: true },
    });
    if (!actor || actor.status !== "ACTIVE" || actor.role !== userRole) return false;

    const owned = await prisma.session.findFirst({
        where: {
            userId,
            OR: [{ id: sessionId }, { sessionId }],
        },
        select: { id: true },
    });
    return !!owned;
}

/**
 * Check if user is the actual owner of a session (not just shared access)
 * Used for protecting management endpoints (e.g. granting/revoking access)
 */
export async function isSessionOwner(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (!isActiveAccountRole(userRole)) return false;

    const session = await prisma.session.findFirst({
        where: {
            OR: [
                { id: sessionId, userId },
                { sessionId: sessionId, userId }
            ]
        }
    });

    return !!session;
}

/**
 * Get sessions that user can access
 * Both active account roles can own sessions; every query remains scoped to
 * the authenticated account's userId.
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (!isActiveAccountRole(userRole)) return [];

    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, ownerId: true },
    });
    if (!actor || actor.status !== "ACTIVE" || actor.role !== userRole) return [];

    return prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
            user: {
                select: {
                    name: true,
                    email: true
                }
            },
            botConfig: { select: safeBotConfigSelect },
            webhooks: { select: safeWebhookSelect },
            _count: {
                select: {
                    contacts: true,
                    messages: true,
                    groups: true,
                    autoReplies: true,
                    scheduledMessages: true
                }
            }
        }
    });
}

export async function getApiKeySummary(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            apiKey: true,
            apiKeyPreview: true,
            apiKeyCreatedAt: true,
        }
    });
}
