import type { NextAuthConfig } from "next-auth";
import { prisma } from "@/lib/prisma";

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
            }
            if (typeof token.id === "string") {
                const currentUser = await prisma.user.findUnique({
                    where: { id: token.id },
                    select: { role: true, status: true, sessionVersion: true },
                });
                token.accountActive = !!currentUser
                    && currentUser.status === "ACTIVE"
                    && currentUser.sessionVersion === token.sessionVersion;
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
        strategy: 'jwt'
    },
    trustHost: true,
} satisfies NextAuthConfig;
