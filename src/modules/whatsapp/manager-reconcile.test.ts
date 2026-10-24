import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression for the silent SESSION_NOT_READY outage: a database blip can drop
// the in-memory instance while the row stays CONNECTED. Reconciliation must
// rebuild it (or leave a session alone when another worker owns the lease).
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  authCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findMany: mocks.findMany },
    authState: { count: mocks.authCount },
  },
}));

// Avoid loading the Baileys store (and its NextAuth dependency) in this unit test.
vi.mock("./instance", () => ({ WhatsAppInstance: class {} }));

vi.mock("@/lib/session-runtime-lock", () => ({
  acquireSessionRuntimeLock: vi.fn(),
  createWorkerId: () => "worker-test",
  heartbeatSessionRuntimeLock: vi.fn(),
  releaseSessionRuntimeLock: vi.fn(),
}));

import { WhatsAppManager } from "./manager";

describe("session reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const manager = WhatsAppManager.getInstance();
    manager.io = { to: () => ({ emit: vi.fn() }) } as never;
  });

  it("re-initialises a CONNECTED session that has no instance", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-1", sessionId: "qa-b-session" }]);
    mocks.authCount.mockResolvedValue(2);
    const start = vi.spyOn(manager, "startSession").mockResolvedValue(undefined);

    await manager.reconcileSessions();

    expect(start).toHaveBeenCalledWith("qa-b-session");
  });

  it("skips a session without credentials", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-2", sessionId: "never-paired" }]);
    mocks.authCount.mockResolvedValue(0);
    const start = vi.spyOn(manager, "startSession").mockResolvedValue(undefined);

    await manager.reconcileSessions();

    expect(start).not.toHaveBeenCalled();
  });

  it("does not fight a session owned by another worker", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-3", sessionId: "qa-b-session" }]);
    mocks.authCount.mockResolvedValue(2);
    vi.spyOn(manager, "startSession").mockRejectedValue(new Error("Session is already active on another worker"));

    await expect(manager.reconcileSessions()).resolves.toBeUndefined();
  });
});
