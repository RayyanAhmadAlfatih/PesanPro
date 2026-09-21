import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  findOwner: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  isAdmin: (role: string) => role === "SUPERADMIN",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findOwner },
    tenantEntitlementOverride: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "127.0.0.1" }));

import { DELETE, GET, PUT } from "@/app/api/admin/entitlement-overrides/[userId]/route";

const context = { params: Promise.resolve({ userId: "owner-1" }) };

describe("tenant entitlement override API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "admin-1", email: "admin@example.com", role: "SUPERADMIN" });
    mocks.findOwner.mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("denies an owner before any database access", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "user-1", role: "USER" });
    const response = await GET(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1"), context);

    expect(response.status).toBe(403);
    expect(mocks.findOwner).not.toHaveBeenCalled();
  });

  it("serializes bigint limits without exposing an unsafe JSON value", async () => {
    mocks.findMany.mockResolvedValue([{ id: "override-1", feature: "MESSAGES_MONTHLY", limitValue: BigInt(10) }]);
    const response = await GET(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1"), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ limitValue: "10" }] });
  });

  it("rejects negative limits and past expiry before starting a transaction", async () => {
    const negative = await PUT(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "MESSAGES_MONTHLY", enabled: true, limit: "-1", reason: "test negative" }),
    }), context);
    const expired = await PUT(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "MESSAGES_MONTHLY", enabled: true, limit: "1", reason: "test expiry", expiresAt: "2020-01-01T00:00:00.000Z" }),
    }), context);

    expect(negative.status).toBe(400);
    expect(expired.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("upserts atomically and writes an audit event", async () => {
    const result = { id: "override-1", tenantId: "owner-1", feature: "MESSAGES_MONTHLY", enabled: true, limitValue: BigInt(25), expiresAt: null };
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: "owner-1" }) },
      tenantEntitlementOverride: { upsert: vi.fn().mockResolvedValue(result) },
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const response = await PUT(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feature: "MESSAGES_MONTHLY", enabled: true, limit: "25", reason: "temporary campaign" }),
    }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { limitValue: "25" } });
    expect(tx.tenantEntitlementOverride.upsert).toHaveBeenCalledOnce();
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.entitlement_override.upsert", resourceId: "override-1" }));
  });

  it("requires an explicit reason before deleting", async () => {
    const response = await DELETE(new NextRequest("http://localhost/api/admin/entitlement-overrides/owner-1?feature=MESSAGES_MONTHLY", { method: "DELETE" }), context);

    expect(response.status).toBe(400);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
