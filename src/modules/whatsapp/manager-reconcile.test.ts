import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// Regression for the silent SESSION_NOT_READY outage: a database blip can drop
// the in-memory instance while the row stays CONNECTED. Reconciliation must
// rebuild it (or leave a session alone when another worker owns the lease).
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  authCount: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findMany: mocks.findMany },
    authState: { count: mocks.authCount },
  },
}));

// Avoid loading the Baileys store (and its NextAuth dependency) in this unit test.
vi.mock("./instance", () => ({ WhatsAppInstance: class {} }));

vi.mock("@/lib/session-alerts", () => ({ notifySessionOwner: mocks.notify }));

vi.mock("@/lib/session-runtime-lock", () => ({
  acquireSessionRuntimeLock: vi.fn(),
  createWorkerId: () => "worker-test",
  heartbeatSessionRuntimeLock: vi.fn(),
  releaseSessionRuntimeLock: vi.fn(),
}));

import { WhatsAppManager } from "./manager";

function resetManager() {
  const manager = WhatsAppManager.getInstance();
  manager.io = { to: () => ({ emit: vi.fn() }) } as never;
  (manager as unknown as { failedRecovery: Map<string, unknown> }).failedRecovery.clear();
  return manager;
}

describe("session reconciliation", () => {
  let clock = 1_700_000_000_000;

  beforeEach(() => {
    vi.clearAllMocks();
    clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    resetManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-initialises a CONNECTED session that has no instance", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-1", sessionId: "qa-b-session", status: "CONNECTED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(2);
    const start = vi.spyOn(manager, "startSession").mockResolvedValue(undefined);

    await manager.reconcileSessions();

    expect(start).toHaveBeenCalledWith("qa-b-session");
  });

  it("skips a session without credentials", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-2", sessionId: "never-paired", status: "CONNECTED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(0);
    const start = vi.spyOn(manager, "startSession").mockResolvedValue(undefined);

    await manager.reconcileSessions();

    expect(start).not.toHaveBeenCalled();
  });

  it("does not fight a session owned by another worker", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-3", sessionId: "qa-b-session", status: "CONNECTED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(2);
    vi.spyOn(manager, "startSession").mockRejectedValue(new Error("Session is already active on another worker"));

    await expect(manager.reconcileSessions()).resolves.toBeUndefined();
  });

  it("retries a FAILED session and backs off between attempts", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-4", sessionId: "qa-b-session", status: "FAILED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(2);
    const start = vi.spyOn(manager, "startSession").mockRejectedValue(new Error("init failed"));

    await manager.reconcileSessions();
    expect(start).toHaveBeenCalledTimes(1);

    clock += 30_000;
    await manager.reconcileSessions();
    expect(start).toHaveBeenCalledTimes(1);

    clock += 40_000;
    await manager.reconcileSessions();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("alerts the owner once after three unsuccessful recoveries", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-5", sessionId: "qa-b-session", status: "FAILED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(2);
    vi.spyOn(manager, "startSession").mockRejectedValue(new Error("init failed"));

    await manager.reconcileSessions();
    clock += 61_000;
    await manager.reconcileSessions();
    clock += 301_000;
    await manager.reconcileSessions();
    clock += 901_000;
    await manager.reconcileSessions();

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith({ userId: "user-1", sessionId: "qa-b-session", kind: "FAILED" });
  });

  it("clears the retry state once the session starts again", async () => {
    const manager = WhatsAppManager.getInstance();
    mocks.findMany.mockResolvedValue([{ id: "db-6", sessionId: "qa-b-session", status: "FAILED", userId: "user-1" }]);
    mocks.authCount.mockResolvedValue(2);
    const start = vi.spyOn(manager, "startSession").mockResolvedValue(undefined);

    await manager.reconcileSessions();
    await manager.reconcileSessions();

    expect(start).toHaveBeenCalledTimes(2);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
