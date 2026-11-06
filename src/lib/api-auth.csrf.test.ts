import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
  getUserByApiKey: vi.fn(),
}));

vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./auth", () => ({ auth: vi.fn() }));
vi.mock("./logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("./api-key-auth", () => ({ getUserByApiKey: mocks.getUserByApiKey }));
vi.mock("./rate-limit", () => ({ getClientIp: vi.fn(() => "127.0.0.1") }));

import { getAuthenticatedUser, isSameOriginRequest } from "./api-auth";
import { auth } from "./auth";

const BASE = "https://wagateway.example.com/api/v1/messages/text";

function request(method: string, headers: Record<string, string> = {}, url = BASE) {
  return new NextRequest(url, { method, headers });
}

describe("isSameOriginRequest (cookie CSRF defence)", () => {
  it("allows safe methods regardless of origin", () => {
    expect(isSameOriginRequest(request("GET", { origin: "https://evil.example.com" }))).toBe(true);
    expect(isSameOriginRequest(request("HEAD", {}))).toBe(true);
    expect(isSameOriginRequest(request("OPTIONS", {}))).toBe(true);
  });

  it("allows a same-origin state-changing request", () => {
    expect(isSameOriginRequest(request("POST", { origin: "https://wagateway.example.com" }))).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(isSameOriginRequest(request("POST", { origin: "https://evil.example.com" }))).toBe(false);
  });

  it("rejects a sandboxed iframe null origin", () => {
    expect(isSameOriginRequest(request("POST", { origin: "null" }))).toBe(false);
  });

  it("rejects when a browser declares the request cross-site", () => {
    expect(
      isSameOriginRequest(request("POST", {
        "sec-fetch-site": "cross-site",
        origin: "https://wagateway.example.com",
      })),
    ).toBe(false);
  });

  it("rejects a foreign referer when origin is absent", () => {
    expect(isSameOriginRequest(request("POST", { referer: "https://evil.example.com/attack" }))).toBe(false);
  });

  it("allows a same-origin referer when origin is absent", () => {
    expect(isSameOriginRequest(request("POST", { referer: "https://wagateway.example.com/dashboard" }))).toBe(true);
  });

  it("allows requests without origin or referer (non-browser client)", () => {
    expect(isSameOriginRequest(request("POST", {}))).toBe(true);
  });

  it("honours x-forwarded-host behind a reverse proxy", () => {
    expect(
      isSameOriginRequest(request("POST", {
        origin: "https://wagateway.example.com",
        host: "internal.local:3000",
        "x-forwarded-host": "wagateway.example.com",
      })),
    ).toBe(true);
    expect(
      isSameOriginRequest(request("POST", {
        origin: "https://evil.example.com",
        host: "internal.local:3000",
        "x-forwarded-host": "wagateway.example.com",
      })),
    ).toBe(false);
  });

  it("rejects an origin that shares the site but not the host", () => {
    expect(isSameOriginRequest(request("POST", { origin: "https://evil.wagateway.example.com" }))).toBe(false);
  });
});

describe("getAuthenticatedUser CSRF and API-key fail-closed behaviour", () => {
  const sessionUser = {
    id: "user-1",
    email: "tenant@example.com",
    name: "Tenant",
    role: "USER",
    status: "ACTIVE",
    ownerId: null,
    sessionVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // auth() is typed as a NextAuth middleware, but getAuthenticatedUser only
    // reads the resolved session object — cast the mock through unknown.
    vi.mocked(auth).mockResolvedValue({ user: sessionUser } as unknown as Awaited<ReturnType<typeof auth>>);
    mocks.prisma.user.findUnique.mockResolvedValue(sessionUser);
  });

  it("rejects a session-authenticated cross-site POST before touching the database", async () => {
    const req = request("POST", {
      origin: "https://evil.example.com",
      "content-type": "text/plain",
    });

    await expect(getAuthenticatedUser(req)).resolves.toBeNull();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("still authenticates a session-authenticated same-origin POST (dashboard keeps working)", async () => {
    const req = request("POST", { origin: "https://wagateway.example.com" });

    await expect(getAuthenticatedUser(req)).resolves.toMatchObject({ id: "user-1", authMethod: "session" });
  });

  it("does not fall back to the session when an API key is present but invalid", async () => {
    mocks.getUserByApiKey.mockResolvedValue(null);
    const req = request("POST", { "x-api-key": "wag_invalid_key" });

    await expect(getAuthenticatedUser(req)).resolves.toBeNull();
    expect(mocks.getUserByApiKey).toHaveBeenCalledWith("wag_invalid_key", "127.0.0.1");
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not fall back to the session when a valid API key lacks the required scope", async () => {
    mocks.getUserByApiKey.mockResolvedValue({
      id: "user-1",
      role: "USER",
      status: "ACTIVE",
      ownerId: null,
      sessionVersion: 1,
      apiKeyId: "key-1",
      apiKeyScopes: ["message:read"],
    });
    const req = request("POST", { "x-api-key": "wag_limited_key" });

    await expect(getAuthenticatedUser(req)).resolves.toBeNull();
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("authenticates a valid API key with the required scope", async () => {
    mocks.getUserByApiKey.mockResolvedValue({
      id: "user-1",
      role: "USER",
      status: "ACTIVE",
      ownerId: null,
      sessionVersion: 1,
      apiKeyId: "key-1",
      apiKeyScopes: ["message:send", "message:read"],
    });
    const req = request("POST", {
      "x-api-key": "wag_good_key",
      origin: "https://evil.example.com",
    });

    await expect(getAuthenticatedUser(req)).resolves.toMatchObject({ id: "user-1", authMethod: "apiKey" });
  });

  it("does not run the origin check for API-key requests from any origin", async () => {
    mocks.getUserByApiKey.mockResolvedValue({
      id: "user-1",
      role: "USER",
      status: "ACTIVE",
      ownerId: null,
      sessionVersion: 1,
      apiKeyId: "key-1",
      apiKeyScopes: ["message:send"],
    });
    const req = request("POST", { "x-api-key": "wag_good_key" });

    await expect(getAuthenticatedUser(req)).resolves.toMatchObject({ id: "user-1", authMethod: "apiKey" });
  });
});
