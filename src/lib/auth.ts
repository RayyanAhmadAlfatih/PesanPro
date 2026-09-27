import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { recordAudit } from "@/lib/audit";
import { authorizeCredentials } from "@/lib/credentials-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: (credentials, request) => authorizeCredentials(credentials, request as unknown as Request),
,
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
