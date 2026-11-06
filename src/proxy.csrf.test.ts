import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), key: vi.fn(), rate: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-key-auth", () => ({ getUserByApiKey: mocks.key }));
vi.mock("@/lib/rate-limit", () => ({ checkPersistentRateLimit: mocks.rate, getClientIp: vi.fn(), rateLimitHeaders: vi.fn(() => ({})) }));
vi.mock("@/lib/usage", () => ({ consumeUsage: mocks.usage, QuotaExceededError: class extends Error {} }));
vi.mock("@/lib/billing", () => ({ requireEntitlement: vi.fn(), EntitlementDeniedError: class extends Error {}, SubscriptionInactiveError: class extends Error {} }));

import { proxy } from "./proxy";

const session = { user: { id: "tenant-1", accountActive: true } };

describe("proxy CSRF origin boundary for cookie-authenticated API traffic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(session);
    mocks.rate.mockResolvedValue({ success: true, remaining: 119, resetMs: Date.now() + 60_000 });
  });

  it("rejects a cross-site POST carrying only the session cookie", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/v1/messages/text", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://evil.example.com" },
    }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("CSRF_ORIGIN_REJECTED");
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it("allows the same-origin dashboard POST", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/v1/messages/text", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows non-browser clients that send no Origin or Referer", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/v1/messages/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects a foreign referer when origin is absent", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/user/api-key", {
      method: "POST",
      headers: { referer: "https://evil.example.com/attack" },
    }));
    expect(response.status).toBe(403);
  });

  it("never applies the origin rule to API-key requests", async () => {
    mocks.key.mockResolvedValue({
      id: "tenant-1", role: "USER", status: "ACTIVE", ownerId: null, sessionVersion: 1,
      apiKeyId: "key-1", apiKeyScopes: ["message:send"],
    });
    const { requireEntitlement } = await import("@/lib/billing");
    vi.mocked(requireEntitlement).mockResolvedValue({ feature: "API_REQUESTS_PER_MINUTE", enabled: true, limit: null, source: "PLAN" } as never);
    const response = await proxy(new NextRequest("http://localhost:3000/api/v1/messages/text", {
      method: "POST",
      headers: { "x-api-key": "wag_valid", "origin": "https://evil.example.com" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("does not restrict safe methods", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/v1/messages", {
      method: "GET",
      headers: { origin: "https://evil.example.com" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("public integration artifact downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
  });

  it("lets anonymous visitors reach the Google Forms connector ZIP", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/public/integration/google-forms"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("keeps unknown public integration paths behind authentication", async () => {
    expect((await proxy(new NextRequest("http://localhost:3000/api/public/integration-secret"))).status).toBe(401);
  });
});
