import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    sessionVersion: number;
    accountActive?: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      sessionVersion: number;
      accountActive?: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role: Role;
    sessionVersion: number;
    accountActive?: boolean;
  }
}
