import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), key: vi.fn(), rate: vi.fn(), usage: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-key-auth", () => ({ getUserByApiKey: mocks.key }));
vi.mock("@/lib/rate-limit", () => ({ checkPersistentRateLimit: mocks.rate, getClientIp: vi.fn(), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/usage", () => ({ consumeUsage: mocks.usage, QuotaExceededError: class extends Error {} }));
vi.mock("@/lib/billing", () => ({ requireEntitlement: vi.fn(), EntitlementDeniedError: class extends Error {}, SubscriptionInactiveError: class extends Error {} }));

import { proxy } from "./proxy";

describe("health probe authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.rate.mockResolvedValue({ success: true, remaining: 119, resetMs: Date.now() + 60_000 });
  });

  it.each(["/api/health", "/api/health/live", "/api/health/ready"])("allows anonymous probes at %s without authentication or billing", async (path) => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`http://localhost${path}`, { method, headers: { "x-api-key": "irrelevant-probe-header" } }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.key).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it.each(["/api/health/secret", "/api/health/ready/private", "/api/health/live-extra", "/api/admin/operations/overview", "/api/v1/messages", "/api/user/api-key"])("keeps authentication on %s", async (path) => {
    expect((await proxy(new NextRequest(`http://localhost${path}`))).status).toBe(401);
  });

  it.each(["/api/health", "/api/health/live"])("does not exempt writes to %s", async (path) => {
    expect((await proxy(new NextRequest(`http://localhost${path}`, { method: "POST" }))).status).toBe(401);
  });
});

describe("integration connector authentication boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.rate.mockResolvedValue({ success: true, remaining: 119, resetMs: Date.now() + 60_000 });
  });

  it.each([
    "/api/v1/integrations/contact-form-7",
    "/api/v1/integrations/woocommerce",
    "/api/v1/integrations/google-forms",
    "/api/v1/integrations/wordpress",
  ])("lets an integration token reach %s without a dashboard session", async (path) => {
    const response = await proxy(new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "x-integration-token": "ppint_example" },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("keeps token management behind authentication", async () => {
    expect((await proxy(new NextRequest("http://localhost/api/v1/integration-tokens"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost/api/v1/integration-tokens", { method: "POST" }))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost/api/v1/integration-tokens/abc", { method: "DELETE" }))).status).toBe(401);
  });

  it("does not exempt non-POST methods or lookalike paths", async () => {
    expect((await proxy(new NextRequest("http://localhost/api/v1/integrations/contact-form-7"))).status).toBe(401);
    expect((await proxy(new NextRequest("http://localhost/api/v1/integrations-private/contact-form-7", { method: "POST" }))).status).toBe(401);
  });

  it("rate limits anonymous connector traffic per IP", async () => {
    mocks.rate.mockResolvedValue({ success: false, remaining: 0, resetMs: Date.now() + 60_000, retryAfterMs: 30_000 });
    const response = await proxy(new NextRequest("http://localhost/api/v1/integrations/contact-form-7", {
      method: "POST",
      headers: { "x-integration-token": "ppint_example" },
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });
});
