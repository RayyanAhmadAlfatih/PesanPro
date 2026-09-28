import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  key: vi.fn(),
  rate: vi.fn(),
  usage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-key-auth", () => ({ getUserByApiKey: mocks.key }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.rate,
  getClientIp: vi.fn(() => "203.0.113.10"),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/usage", () => ({ consumeUsage: mocks.usage, QuotaExceededError: class extends Error {} }));
vi.mock("@/lib/billing", () => ({
  requireEntitlement: vi.fn(),
  EntitlementDeniedError: class extends Error {},
  SubscriptionInactiveError: class extends Error {},
}));

import { proxy } from "./proxy";

const request = (path: string) => new NextRequest(`https://pesanpro.example${path}`);

describe("public website and authenticated app routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
  });

  it("lets anonymous unknown website routes reach the Next.js 404", async () => {
    const response = await proxy(request("/halaman-yang-tidak-ada"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each([
    "/blog",
    "/blog/cara-pakai-pesanpro",
    "/contact",
    "/pricing",
    "/brand/pesanpro-logo.webp",
    "/assets/fonts/pesanpro.woff2",
  ])("allows public website/static path %s without authentication", async (path) => {
    const response = await proxy(request(path));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("does not turn an API route public just because it looks like an asset", async () => {
    const response = await proxy(request("/api/private/logo.webp"));

    expect(response.status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledOnce();
  });

  it("still redirects anonymous dashboard traffic to login with callbackUrl", async () => {
    const response = await proxy(request("/dashboard/campaigns"));

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
    expect(location).toContain("callbackUrl=%2Fdashboard%2Fcampaigns");
  });
});
