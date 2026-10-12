import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { checkPersistentRateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { otpVerifySchema } from "@/lib/otp-input";
import { verifyLoginOtp } from "@/lib/otp-service";

/**
 * NextAuth hands `code` back to the client, so the OTP tab can explain why a
 * code was refused instead of showing one generic failure for every cause.
 */
class OtpSignInError extends CredentialsSignin {
  code = "otp_error";
  constructor(reason: string) {
    super();
    this.code = reason;
  }
}

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
    Credentials({
      id: "email-otp",
      name: "Email OTP",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (credentials, request) => {
        const parsed = otpVerifySchema.safeParse(credentials);
        if (!parsed.success) throw new OtpSignInError("invalid_code");

        const headers = (request as unknown as Request | undefined)?.headers as Headers | undefined;
        const ip = headers ? getClientIp(headers) : "unknown";
        const userAgent = headers?.get("user-agent");

        const result = await verifyLoginOtp({
          email: parsed.data.email,
          code: parsed.data.code,
          ip,
          userAgent,
        });
        if (!result.ok) throw new OtpSignInError(result.reason);

        const user = await prisma.user.findUnique({ where: { id: result.userId } });
        if (!user || user.status !== "ACTIVE") throw new OtpSignInError("account_inactive");

        await recordAudit({
          userId: user.id,
          userEmail: user.email,
          action: "user.login",
          resource: "user",
          resourceId: user.id,
          ip,
          userAgent,
          meta: { method: "email_otp" },
        });
        return user;
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
