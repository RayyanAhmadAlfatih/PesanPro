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

describe("roadmap L1/L2 dashboard access gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[L1-15] redirects a logged-out dashboard request to login", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await proxy(request("/dashboard"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
    expect(location).toContain("callbackUrl=%2Fdashboard");
  });

  it.each([
    ["L2-01", "/dashboard/users"],
    ["L2-02", "/dashboard/commercial"],
    ["L2-03", "/dashboard/settings"],
    ["L2-04", "/dashboard/system-monitor"],
    ["L2-05", "/dashboard/notifications"],
  ])("[%s] redirects a normal user away from %s", async (_id, path) => {
    mocks.auth.mockResolvedValue({ user: { id: "user-a", role: "USER", accountActive: true } });
    const response = await proxy(request(path));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("https://pesanpro.example/dashboard");
  });

  it("[L2-07] allows a superadmin through administration routes", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-a", role: "SUPERADMIN", accountActive: true } });
    for (const path of [
      "/dashboard/users",
      "/dashboard/commercial",
      "/dashboard/settings",
      "/dashboard/system-monitor",
      "/dashboard/notifications",
    ]) {
      const response = await proxy(request(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("[L1-23] treats an inactive account as unauthenticated at the dashboard boundary", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-a", role: "USER", accountActive: false } });
    const response = await proxy(request("/dashboard"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toContain("/auth/login");
  });
});
