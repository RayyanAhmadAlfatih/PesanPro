import { describe, expect, it, vi } from "vitest";

// Regression for the duplicate message.sent events: both dispatch paths must
// carry the WhatsApp message id as the explicit outbox key so the unique
// constraint collapses them into one delivery.
const mocks = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock("@/lib/webhook-outbox", () => ({ publishWebhookEvent: mocks.publish }));
// The manager pulls in the Baileys store and NextAuth; the dispatch path only
// needs getOwnJid, which returns null in this unit test.
vi.mock("@/modules/whatsapp/manager", () => ({ waManager: { getInstance: () => null } }));

import { dispatchWebhook, onConnectionUpdate } from "./webhook";

describe("dispatchWebhook event key", () => {
  it("forwards the explicit message id to the outbox", async () => {
    const payload = { key: { id: "PP123" }, content: "halo" };

    await dispatchWebhook("qa-b-session", "message.sent", payload, "PP123");

    expect(mocks.publish).toHaveBeenCalledWith("qa-b-session", "message.sent", payload, "PP123");
  });

  it("keeps the existing signature when no key is supplied", async () => {
    const payload = { status: "SENT" };

    await dispatchWebhook("qa-b-session", "connection.update", payload);

    expect(mocks.publish).toHaveBeenCalledWith("qa-b-session", "connection.update", payload, undefined);
  });

  it("publishes a connection.update event for subscribers", async () => {
    onConnectionUpdate("qa-b-session", "CONNECTED");
    await Promise.resolve();

    expect(mocks.publish).toHaveBeenCalledWith(
      "qa-b-session",
      "connection.update",
      { status: "CONNECTED", qr: null },
      undefined,
    );
  });
});
