import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { checkPersistentRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(1).max(128) })
          .safeParse(credentials);

        if (!parsedCredentials.success) return null;

        const email = parsedCredentials.data.email.trim().toLowerCase();
        const { password } = parsedCredentials.data;
        const headers = (request as unknown as Request | undefined)?.headers as Headers | undefined;
        const ip = headers ? getClientIp(headers) : "unknown";

        const rl = await checkPersistentRateLimit(`login:${ip}:${email}`, 5, 15 * 60 * 1000);
        if (!rl.success) {
          await recordAudit({
            userEmail: email,
            action: "user.login_failed",
            resource: "user",
            ip,
            userAgent: headers?.get("user-agent"),
            meta: { reason: "rate_limited" },
          });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.status !== "ACTIVE") {
          await recordAudit({
            userId: user?.id,
            userEmail: email,
            action: "user.login_failed",
            resource: "user",
            resourceId: user?.id,
            ip,
            userAgent: headers?.get("user-agent"),
            meta: { reason: user ? "account_inactive" : "invalid_credentials" },
          });
          return null;
        }

        const passwordsMatch = await bcrypt.compare(password, user.password);

        if (passwordsMatch) {
          await recordAudit({
            userId: user.id,
            userEmail: user.email,
            action: "user.login",
            resource: "user",
            resourceId: user.id,
            ip,
            userAgent: headers?.get("user-agent"),
          });
          return user;
        }
        await recordAudit({
          userId: user.id,
          userEmail: user.email,
          action: "user.login_failed",
          resource: "user",
          resourceId: user.id,
          ip,
          userAgent: headers?.get("user-agent"),
          meta: { reason: "invalid_credentials" },
        });
        return null;
      },
    }),
  ],
  events: {
    async signOut(message) {
      const userId = "token" in message ? message.token?.id : message.session?.userId;
      if (typeof userId === "string") {
        await recordAudit({
          userId,
          action: "user.logout",
          resource: "user",
          resourceId: userId,
        });
      }
    },
  },
  secret: process.env.AUTH_SECRET,
});
