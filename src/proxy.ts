import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserByApiKey } from "@/lib/api-key-auth";
import { getRequiredApiScope } from "@/lib/api-scope-policy";
import { checkPersistentRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { consumeUsage, QuotaExceededError } from "@/lib/usage";
import { EntitlementDeniedError, requireEntitlement, SubscriptionInactiveError } from "@/lib/billing";
import { canAccessDashboardPath } from "@/lib/access-policy";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Infrastructure probes must work without a user session or API quota.
    if (
        (request.method === "GET" || request.method === "HEAD") &&
        (pathname === "/api/health/live" || pathname === "/api/health/ready")
    ) {
        return NextResponse.next();
    }

    // Public routes that don't require authentication
    const publicRoutes = [
        "/auth/login",
        "/auth/register",
        "/auth/forgot-password",
        "/auth/reset-password",
        "/api/auth",
        "/api/test",
        "/terms",
        "/privacy",
    ];

    // Check if it's a public route
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

    // Allow Next.js internals and favicon only
    if (
        pathname.startsWith("/_next") ||
        pathname === "/favicon.ico"
    ) {
        return NextResponse.next();
    }

    // Allow known static asset extensions in root path only (e.g. /vercel.svg)
    const staticExtensions = [".svg", ".ico", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2", ".ttf"];
    if (pathname.lastIndexOf("/") === 0 && staticExtensions.some(ext => pathname.endsWith(ext))) {
        return NextResponse.next();
    }

    // API routes: Check for API key or session
    if (pathname.startsWith("/api/")) {
        // Machine-only routes perform their own constant-time secret validation.
        if (pathname.startsWith("/api/internal/")) {
            return NextResponse.next();
        }

        // Skip auth endpoints
        if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/test")) {
            return NextResponse.next();
        }

        // Check for API key in header
        const apiKey = request.headers.get("x-api-key");
        if (apiKey) {
            const ip = getClientIp(request.headers);
            const apiKeyUser = await getUserByApiKey(apiKey, ip);
            if (!apiKeyUser) {
                return NextResponse.json({ error: "Invalid, expired, revoked, or IP-restricted API key", code: "INVALID_API_KEY" }, { status: 401 });
            }

            const requiredScope = getRequiredApiScope(request.method, pathname);
            if (!requiredScope || !apiKeyUser.apiKeyScopes?.includes(requiredScope)) {
                return NextResponse.json({ error: "API key scope does not allow this operation", code: "SCOPE_FORBIDDEN" }, { status: 403 });
            }

            let packageRateLimit: number;
            try {
                const entitlement = await requireEntitlement(apiKeyUser.id, "API_REQUESTS_PER_MINUTE");
                packageRateLimit = entitlement.limit === null ? 300 : Number(entitlement.limit);
            } catch (error) {
                if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
                    return NextResponse.json({ error: error.message, code: "ENTITLEMENT_DENIED" }, { status: 403 });
                }
                throw error;
            }
            const rateLimit = await checkPersistentRateLimit(`developer-api:${apiKeyUser.apiKeyId ?? apiKeyUser.id}`, packageRateLimit, 60_000);
            if (!rateLimit.success) {
                return NextResponse.json({ error: "Developer API rate limit exceeded", code: "RATE_LIMITED" }, {
                    status: 429,
                    headers: rateLimitHeaders(rateLimit, packageRateLimit),
                });
            }

            try {
                await consumeUsage({
                    userId: apiKeyUser.id,
                    feature: "API_REQUESTS_MONTHLY",
                    apiKeyId: apiKeyUser.apiKeyId,
                    meta: { method: request.method, endpoint: pathname, ip },
                });
            } catch (error) {
                if (error instanceof QuotaExceededError) {
                    return NextResponse.json({ error: "Developer API quota exceeded", code: "QUOTA_EXCEEDED", limit: error.limit.toString() }, { status: 429 });
                }
                if (error instanceof EntitlementDeniedError || error instanceof SubscriptionInactiveError) {
                    return NextResponse.json({ error: error.message, code: "ENTITLEMENT_DENIED" }, { status: 403 });
                }
                throw error;
            }

            const response = NextResponse.next();
            for (const [name, value] of Object.entries(rateLimitHeaders(rateLimit, packageRateLimit))) response.headers.set(name, value);
            return response;
        }

        // Check for session auth
        const session = await auth();
        if (!session?.user || session.user.accountActive === false) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        return NextResponse.next();
    }

    // Dashboard routes: Require login
    if (pathname.startsWith("/dashboard")) {
        const session = await auth();

        if (!session?.user || session.user.accountActive === false) {
            const loginUrl = new URL("/auth/login", request.url);
            loginUrl.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(loginUrl);
        }

        if (!canAccessDashboardPath(session.user.role, pathname)) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }

        return NextResponse.next();
    }

    // Root path — redirect to dashboard if logged in
    if (pathname === "/") {
        const session = await auth();
        if (session?.user && session.user.accountActive !== false) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        return NextResponse.next();
    }

    // Public routes
    if (isPublicRoute) {
        const session = await auth();
        if (session?.user && session.user.accountActive !== false && (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register"))) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        return NextResponse.next();
    }

    // Default: require auth for everything else
    const session = await auth();
    if (!session?.user || session.user.accountActive === false) {
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
