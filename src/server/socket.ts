import { Server, Socket } from "socket.io";
import { decode } from "next-auth/jwt";
import { logger } from "../lib/logger";
import { getEnv } from "../lib/env";
import { getUserByApiKey } from "../lib/api-key-auth";
import { hasApiKeyScope } from "../lib/api-key-service";
import { prisma } from "../lib/prisma";
import type { Role } from "@prisma/client";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

type SocketAuthState = {
  role?: Role;
  userId?: string;
};

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

async function resolveUserFromSessionCookie(cookieHeader: string | undefined): Promise<SocketAuthState | null> {
  if (!cookieHeader) {
    return null;
  }

  for (const cookieName of SESSION_COOKIE_NAMES) {
    const token = getCookieValue(cookieHeader, cookieName);
    if (!token) {
      continue;
    }

    try {
      const payload = await decode({
        token,
        secret: getEnv().AUTH_SECRET,
        salt: cookieName,
      });

      const userId =
        typeof payload?.id === "string"
          ? payload.id
          : typeof payload?.sub === "string"
            ? payload.sub
            : null;

      if (!userId) {
        continue;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, sessionVersion: true },
      });

      const tokenVersion = typeof payload?.sessionVersion === "number" ? payload.sessionVersion : 0;
      if (user?.status === "ACTIVE" && user.sessionVersion === tokenVersion) {
        return { userId, role: user.role };
      }
    } catch (error) {
      logger.warn("Socket", `Failed to decode session cookie ${cookieName}:`, error);
    }
  }

  return null;
}

export function setupSocket(io: Server) {
  io.use(async (socket, next) => {
    try {
      const req = socket.request as unknown as { headers: Record<string, string | undefined> };
      const headers = req.headers ?? {};
      const cookieHeader = headers.cookie ?? "";
      const apiKey =
        (socket.handshake.auth as Record<string, unknown> | undefined)?.apiKey as string | undefined ??
        (headers["x-api-key"] as string | undefined) ??
        (headers["x-api-key".toLowerCase()] as string | undefined);

      if (apiKey && typeof apiKey === "string") {
        const user = await getUserByApiKey(apiKey, socket.handshake.address);
        if (!user || !hasApiKeyScope(user.apiKeyScopes ?? [], "device:read")) {
          return next(new Error("unauthorized: invalid api key"));
        }

        (socket.data as Record<string, unknown>).userId = user.id;
        (socket.data as Record<string, unknown>).role = user.role;
        return next();
      }

      const sessionUser = await resolveUserFromSessionCookie(cookieHeader);
      if (sessionUser?.userId && sessionUser.role) {
        (socket.data as Record<string, unknown>).userId = sessionUser.userId;
        (socket.data as Record<string, unknown>).role = sessionUser.role;
        return next();
      }

      return next(new Error("unauthorized"));
    } catch (e) {
      logger.error("Socket", "Auth middleware error:", e);
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    logger.info("Socket", "Client connected:", socket.id);

    socket.on("disconnect", () => {
      logger.info("Socket", "Client disconnected:", socket.id);
    });

    // Join WA session room — requires ownership check
    socket.on("join-session", async (sessionId: string) => {
      if (!sessionId || typeof sessionId !== "string") return;

      const data = socket.data as Record<string, unknown>;
      const userId = data.userId as string | undefined;
      const role = data.role as string | undefined;

      try {
        if (!userId || !role) {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }

        // Loading api-auth during process bootstrap initializes Next request storage too early.
        const { canAccessSession } = await import("../lib/api-auth");
        const authorized = await canAccessSession(userId, role, sessionId);
        if (!authorized) {
          logger.warn("Socket", `Rejected join-session ${sessionId} for socket ${socket.id}: not authorized`);
          socket.emit("error", { message: "Forbidden: cannot access session" });
          return;
        }

        await socket.join(sessionId);
        logger.debug("Socket", `Socket ${socket.id} joined session room: ${sessionId}`);
      } catch (e) {
        logger.error("Socket", `Error handling join-session ${sessionId}:`, e);
      }
    });

    // Join user-specific room — only allow own userId
    socket.on("join-user-room", async (userId: string) => {
      if (!userId || typeof userId !== "string") return;
      const data = socket.data as Record<string, unknown>;
      const authedUserId = data.userId as string | undefined;

      if (!authedUserId) {
        logger.warn("Socket", `Reject join-user-room ${userId}: unauthenticated`);
        socket.emit("error", { message: "Unauthorized" });
        return;
      }

      if (authedUserId !== userId) {
        logger.warn("Socket", `Rejected join-user-room ${userId}: authed as ${authedUserId}`);
        socket.emit("error", { message: "Forbidden: cannot join other user room" });
        return;
      }

      await socket.join(`user:${userId}`);
      logger.debug("Socket", `Socket ${socket.id} joined user room: user:${userId}`);
    });
  });
}
