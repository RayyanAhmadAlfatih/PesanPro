import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  webhookOutboxEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("./prisma", () => ({ prisma: prismaMock }));

import { publishWebhookEvent } from "./webhook-outbox";

describe("publishWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({ id: "sess-db-1", userId: "tenant-1" });
  });

  it("returns the existing event without creating when the event key already exists", async () => {
    const existing = { id: "wh_evt_existing" };
    prismaMock.webhookOutboxEvent.findUnique.mockResolvedValue(existing);

    const result = await publishWebhookEvent("sess-1", "message.sent", { key: { id: "msg-1" } }, "msg-1");

    expect(result).toBe(existing);
    expect(prismaMock.webhookOutboxEvent.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.webhookOutboxEvent.create).not.toHaveBeenCalled();
  });

  it("creates the event when the key is new", async () => {
    prismaMock.webhookOutboxEvent.findUnique.mockResolvedValue(null);
    const created = { id: "wh_evt_new" };
    prismaMock.webhookOutboxEvent.create.mockResolvedValue(created);

    const result = await publishWebhookEvent("sess-1", "message.sent", { key: { id: "msg-2" } });

    expect(result).toBe(created);
    expect(prismaMock.webhookOutboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it("returns null when the session does not exist", async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);

    const result = await publishWebhookEvent("missing", "message.sent", {});

    expect(result).toBeNull();
    expect(prismaMock.webhookOutboxEvent.create).not.toHaveBeenCalled();
  });
});
