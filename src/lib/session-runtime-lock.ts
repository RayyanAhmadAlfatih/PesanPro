import crypto from "crypto";
import os from "os";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

export const SESSION_LOCK_TTL_MS = 45_000;

export function createWorkerId(): string {
  return `${os.hostname()}:${process.pid}:${crypto.randomBytes(6).toString("hex")}`;
}

export async function acquireSessionRuntimeLock(
  sessionDbId: string,
  workerId: string,
  now = new Date(),
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + SESSION_LOCK_TTL_MS);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.sessionRuntimeLock.deleteMany({
        where: { sessionId: sessionDbId, expiresAt: { lte: now } },
      });

      const existing = await tx.sessionRuntimeLock.findUnique({
        where: { sessionId: sessionDbId },
        select: { workerId: true },
      });

      if (existing && existing.workerId !== workerId) {
        return false;
      }

      await tx.sessionRuntimeLock.upsert({
        where: { sessionId: sessionDbId },
        create: { sessionId: sessionDbId, workerId, expiresAt, heartbeatAt: now },
        update: { workerId, expiresAt, heartbeatAt: now },
      });
      return true;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

export async function heartbeatSessionRuntimeLock(
  sessionDbId: string,
  workerId: string,
  now = new Date(),
): Promise<boolean> {
  const updated = await prisma.sessionRuntimeLock.updateMany({
    where: { sessionId: sessionDbId, workerId },
    data: {
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + SESSION_LOCK_TTL_MS),
    },
  });
  return updated.count === 1;
}

export async function releaseSessionRuntimeLock(sessionDbId: string, workerId: string): Promise<void> {
  await prisma.sessionRuntimeLock.deleteMany({
    where: { sessionId: sessionDbId, workerId },
  });
}
