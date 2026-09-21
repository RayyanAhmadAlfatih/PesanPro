import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    sessionRuntimeLock: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
      sessionRuntimeLock: {
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));

import {
  acquireSessionRuntimeLock,
  heartbeatSessionRuntimeLock,
  releaseSessionRuntimeLock,
  SESSION_LOCK_TTL_MS,
} from "./session-runtime-lock";

describe("session runtime lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.sessionRuntimeLock.findUnique.mockResolvedValue(null);
    mocks.tx.sessionRuntimeLock.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.sessionRuntimeLock.upsert.mockResolvedValue({});
  });

  it("acquires an available lease with a bounded expiry", async () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    await expect(acquireSessionRuntimeLock("session-db-id", "worker-a", now)).resolves.toBe(true);
    expect(mocks.tx.sessionRuntimeLock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        sessionId: "session-db-id",
        workerId: "worker-a",
        expiresAt: new Date(now.getTime() + SESSION_LOCK_TTL_MS),
      }),
    }));
  });

  it("rejects a second worker while the lease is active", async () => {
    mocks.tx.sessionRuntimeLock.findUnique.mockResolvedValue({ workerId: "worker-a" });
    await expect(acquireSessionRuntimeLock("session-db-id", "worker-b")).resolves.toBe(false);
    expect(mocks.tx.sessionRuntimeLock.upsert).not.toHaveBeenCalled();
  });

  it("heartbeats and releases only the owning worker lease", async () => {
    mocks.prisma.sessionRuntimeLock.updateMany.mockResolvedValue({ count: 1 });
    await expect(heartbeatSessionRuntimeLock("session-db-id", "worker-a")).resolves.toBe(true);
    expect(mocks.prisma.sessionRuntimeLock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId: "session-db-id", workerId: "worker-a" },
    }));

    await releaseSessionRuntimeLock("session-db-id", "worker-a");
    expect(mocks.prisma.sessionRuntimeLock.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: "session-db-id", workerId: "worker-a" },
    });
  });
});
