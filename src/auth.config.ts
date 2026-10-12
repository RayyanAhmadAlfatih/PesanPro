import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
    hoursToMs,
    isSessionAbsolutelyExpired,
    resolveSessionAbsoluteMaxHours,
    resolveSessionTimeoutHours,
    sessionUpdateAgeSeconds,
} from "@/lib/session-policy";

// Read straight from process.env. This module is loaded by the middleware, so it
// must not depend on the env validator, which throws on an invalid environment.
const sessionMaxAgeSeconds = resolveSessionTimeoutHours(process.env.SESSION_TIMEOUT_HOURS) * 60 * 60;
const sessionAbsoluteMaxMs = hoursToMs(resolveSessionAbsoluteMaxHours(process.env.SESSION_ABSOLUTE_MAX_HOURS));

export const authConfig = {
    pages: {
        signIn: '/auth/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user && auth.user.accountActive !== false;
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
            
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn && nextUrl.pathname === '/auth/login') {
                return Response.redirect(new URL('/dashboard', nextUrl));
            }
            return true;
        },
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.sessionVersion = user.sessionVersion;
                token.sessionStartedAt = Date.now();
            }
            if (typeof token.id === "string") {
                // A token without a start time was issued before the absolute cap
                // existed. Stamping it now bounds that session from the upgrade
                // instead of leaving an unlimited legacy path.
                const sessionStartedAt = typeof token.sessionStartedAt === "number" ? token.sessionStartedAt : Date.now();
                token.sessionStartedAt = sessionStartedAt;

                const currentUser = await prisma.user.findUnique({
                    where: { id: token.id },
                    select: { role: true, status: true, sessionVersion: true },
                });
                token.accountActive = !!currentUser
                    && currentUser.status === "ACTIVE"
                    && currentUser.sessionVersion === token.sessionVersion
                    && !isSessionAbsolutelyExpired(sessionStartedAt, Date.now(), sessionAbsoluteMaxMs);
                if (currentUser) token.role = currentUser.role;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role;
                session.user.sessionVersion = token.sessionVersion;
                session.user.accountActive = token.accountActive;
            }
            return session;
        }
    },
    providers: [], // Configured in auth.ts
    session: {
        strategy: 'jwt',
        // SESSION_TIMEOUT_HOURS is the idle window and was dead configuration
        // before this: with no maxAge, NextAuth falls back to 30 days.
        maxAge: sessionMaxAgeSeconds,
        updateAge: sessionUpdateAgeSeconds(sessionMaxAgeSeconds),
    },
    trustHost: true,
} satisfies NextAuthConfig;
