import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Fase 0 #2: reacting to an outgoing message needs fromMe: true on the key.
// The route used to hardcode false, so the reaction targeted the wrong message
// while still answering 200.
const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  canAccessSession: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  canAccessSession: mocks.canAccessSession,
}));

vi.mock("@/modules/whatsapp/manager", () => ({
  waManager: { getInstance: () => ({ socket: { sendMessage: mocks.sendMessage } }) },
}));

import { POST as react } from "@/app/api/messages/[sessionId]/[jid]/[messageId]/react/route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/messages/sess/628111%40s.whatsapp.net/MSG1/react", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ sessionId: "sess", jid: "628111%40s.whatsapp.net", messageId: "MSG1" }) };

describe("legacy react route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "u1", role: "USER", ownerId: null, email: "a@b.c" });
    mocks.canAccessSession.mockResolvedValue(true);
    mocks.sendMessage.mockResolvedValue({});
  });

  it("uses fromMe=true when reacting to our own message", async () => {
    const response = await react(request({ emoji: "👍", fromMe: true }), params);

    expect(response.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith("628111@s.whatsapp.net", {
      react: { text: "👍", key: { remoteJid: "628111@s.whatsapp.net", fromMe: true, id: "MSG1" } },
    });
  });

  it("keeps fromMe=false for callers that do not send the field", async () => {
    const response = await react(request({ emoji: "❤️" }), params);

    expect(response.status).toBe(200);
    expect(mocks.sendMessage).toHaveBeenCalledWith("628111@s.whatsapp.net", {
      react: { text: "❤️", key: { remoteJid: "628111@s.whatsapp.net", fromMe: false, id: "MSG1" } },
    });
  });

  it("rejects a non-boolean fromMe before touching the socket", async () => {
    const response = await react(request({ emoji: "👍", fromMe: "yes" }), params);

    expect(response.status).toBe(400);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
