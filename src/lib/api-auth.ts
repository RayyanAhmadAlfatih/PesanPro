import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";
import type { ApiKeyScope } from "./api-key-service";
import { getClientIp } from "./rate-limit";
import { getRequiredApiScope } from "./api-scope-policy";
import { getUserByApiKey } from "./api-key-auth";
import { isSuperadmin } from "./access-policy";

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
        logger.error("Auth", "API key validation error:", error);
        return null;
    }
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    // First try API key if request is provided
    if (request) {
        const apiKeyUser = await validateApiKey(request);
        if (apiKeyUser) {
            const requiredScope = getRequiredApiScope(request.method, request.nextUrl.pathname);
            if (requiredScope && apiKeyUser.apiKeyScopes?.includes(requiredScope)) {
            return { ...apiKeyUser, authMethod: "apiKey" as const };
            }
        }
    }

    // Fall back to session auth
    const session = await auth();
    if (session?.user?.id) {
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
 * - SUPERADMIN can access all sessions
 * - Other users can access their own sessions OR sessions shared with them
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) {
        return true;
    }

    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, ownerId: true },
    });
    if (!actor || actor.status !== "ACTIVE") return false;

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
    if (isAdmin(userRole)) {
        return true;
    }

    if (userRole !== "USER") return false;

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
 * - SUPERADMIN sees all
 * - Others see only their own
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (isAdmin(userRole)) {
        return prisma.session.findMany({
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

    const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, ownerId: true },
    });
    if (!actor || actor.status !== "ACTIVE") return [];

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
