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
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(null); });

  it.each(["/api/health/live", "/api/health/ready"])("allows anonymous probes at %s without authentication or billing", async (path) => {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`http://localhost${path}`, { method, headers: { "x-api-key": "irrelevant-probe-header" } }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.key).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it.each(["/api/health", "/api/health/ready/private", "/api/health/live-extra", "/api/admin/operations/overview"])("keeps authentication on %s", async (path) => {
    expect((await proxy(new NextRequest(`http://localhost${path}`))).status).toBe(401);
  });

  it("does not exempt writes to probe paths", async () => {
    expect((await proxy(new NextRequest("http://localhost/api/health/live", { method: "POST" }))).status).toBe(401);
  });
});
