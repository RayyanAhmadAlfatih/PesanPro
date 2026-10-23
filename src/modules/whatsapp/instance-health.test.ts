import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

// Fase 0 #1 (2026-10-21): a session could stay CONNECTED while the WhatsApp
// socket was dead. These tests cover the health check that must notice it.
const mocks = vi.hoisted(() => ({
  sessionUpdate: vi.fn(),
  sessionFindUnique: vi.fn(),
  authStateDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { update: mocks.sessionUpdate, findUnique: mocks.sessionFindUnique },
    authState: { deleteMany: mocks.authStateDeleteMany },
  },
}));

// The health check never touches the store; mocking it keeps the test focused.
vi.mock("./store", () => ({ bindSessionStore: vi.fn() }));
vi.mock("./store/groups", () => ({ syncGroups: vi.fn() }));
vi.mock("./store/contacts", () => ({ bindContactSync: vi.fn() }));
vi.mock("./store/ppguard", () => ({ bindPpGuard: vi.fn() }));
vi.mock("./antispam", () => ({ antispam: { enqueue: vi.fn() } }));

import { WhatsAppInstance } from "./instance";

function createInstance() {
  const io = {
    to: () => ({ emit: vi.fn() }),
  } as unknown as Server;
  const instance = new WhatsAppInstance("qa-session", "user-1", io);
  instance.status = "CONNECTED";
  return instance;
}

function fakeSocket(options: { isOpen: boolean; query: () => Promise<unknown> }) {
  return {
    ws: { isOpen: options.isOpen },
    query: vi.fn(options.query),
    end: vi.fn(),
  };
}

describe("WhatsAppInstance health check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionUpdate.mockResolvedValue({});
  });

  it("restarts a CONNECTED session whose transport is already closed", async () => {
    const instance = createInstance();
    instance.socket = fakeSocket({ isOpen: false, query: async () => ({}) }) as never;
    const init = vi.spyOn(instance, "init").mockResolvedValue(undefined);

    const result = await instance.checkHealth();

    expect(result).toBe("restarted");
    expect(init).toHaveBeenCalledTimes(1);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RECONNECTING" }) }),
    );
  });

  it("keeps a session whose protocol ping is answered", async () => {
    const instance = createInstance();
    const socket = fakeSocket({ isOpen: true, query: async () => ({ tag: "iq" }) });
    instance.socket = socket as never;
    const init = vi.spyOn(instance, "init").mockResolvedValue(undefined);

    const result = await instance.checkHealth();

    expect(result).toBe("ok");
    expect(socket.query).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
  });

  it("tolerates one missed ping but restarts after the second", async () => {
    const instance = createInstance();
    instance.socket = fakeSocket({ isOpen: true, query: async () => { throw new Error("timeout"); } }) as never;
    const init = vi.spyOn(instance, "init").mockResolvedValue(undefined);

    expect(await instance.checkHealth()).toBe("degraded");
    expect(init).not.toHaveBeenCalled();

    expect(await instance.checkHealth()).toBe("restarted");
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("leaves a stopped session alone", async () => {
    const instance = createInstance();
    instance.isStopped = true;
    instance.socket = fakeSocket({ isOpen: false, query: async () => ({}) }) as never;
    const init = vi.spyOn(instance, "init").mockResolvedValue(undefined);

    expect(await instance.checkHealth()).toBe("skipped");
    expect(init).not.toHaveBeenCalled();
  });
});
