import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  collectOperationalSnapshot: vi.fn(),
  collectReadinessSnapshot: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser, isAdmin: (role: string) => role === "SUPERADMIN" }));
vi.mock("@/lib/operations", () => ({ collectOperationalSnapshot: mocks.collectOperationalSnapshot, collectReadinessSnapshot: mocks.collectReadinessSnapshot }));

import { GET as overview } from "@/app/api/admin/operations/overview/route";
import { GET as readiness } from "@/app/api/health/ready/route";

describe("Phase 9 operational API boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("denies an authenticated owner from the global operations snapshot", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "user", role: "USER" });
    const response = await overview(new NextRequest("http://localhost/api/admin/operations/overview"));
    expect(response.status).toBe(403);
    expect(mocks.collectOperationalSnapshot).not.toHaveBeenCalled();
  });

  it("returns a no-store snapshot only for superadmin", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "admin", role: "SUPERADMIN" });
    mocks.collectOperationalSnapshot.mockResolvedValue({ timestamp: "now" });
    const response = await overview(new NextRequest("http://localhost/api/admin/operations/overview"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.collectOperationalSnapshot).toHaveBeenCalledWith({ persistAlerts: true });
  });

  it("maps dependency failure to readiness HTTP 503 without leaking exceptions", async () => {
    mocks.collectReadinessSnapshot.mockResolvedValue({ ok: false, checks: { database: { ok: false } } });
    const response = await readiness();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "not_ready", check: "readiness", ok: false });
  });
});
