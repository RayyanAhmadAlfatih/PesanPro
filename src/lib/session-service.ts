import { Prisma, type Role } from "@prisma/client";
import { prisma } from "./prisma";
import {
  canCreateDevice,
  DeviceLimitError,
  DevicePermissionError,
} from "./device-policy";
import { requireEntitlement } from "./billing";

interface CreateOwnedSessionInput {
  userId: string;
  role: Role;
  name: string;
  sessionId: string;
}

export async function createOwnedSession(input: CreateOwnedSessionInput) {
  if (!canCreateDevice(input.role)) {
    throw new DevicePermissionError();
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const owner = await tx.user.findUnique({
          where: { id: input.userId },
          select: { role: true, status: true },
        });

        if (!owner || owner.status !== "ACTIVE" || !canCreateDevice(owner.role)) {
          throw new DevicePermissionError();
        }

        const currentCount = await tx.session.count({ where: { userId: input.userId } });
        const entitlement = await requireEntitlement(input.userId, "DEVICES", tx);
        if (entitlement.limit !== null && BigInt(currentCount) >= entitlement.limit) {
          throw new DeviceLimitError(Number(entitlement.limit));
        }

        return tx.session.create({
          data: {
            userId: input.userId,
            name: input.name,
            sessionId: input.sessionId,
            status: "STOPPED",
            botConfig: {
              create: { enabled: true, botMode: "OWNER", autoReplyMode: "ALL" },
            },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to create device after transaction retries");
}
