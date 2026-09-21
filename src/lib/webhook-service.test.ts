import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessSession: vi.fn(),
  resolveTenantId: vi.fn(),
  requireEntitlement: vi.fn(),
  sessionFindFirst: vi.fn(),
  webhookFindMany: vi.fn(),
  webhookFindFirst: vi.fn(),
  deliveryFindFirst: vi.fn(),
  deliveryCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("./api-auth", () => ({ canAccessSession: mocks.canAccessSession }));
vi.mock("./billing", () => ({
  resolveTenantId: mocks.resolveTenantId,
  requireEntitlement: mocks.requireEntitlement,
  EntitlementDeniedError: class EntitlementDeniedError extends Error {},
  SubscriptionInactiveError: class SubscriptionInactiveError extends Error {},
}));
vi.mock("./prisma", () => ({
  prisma: {
    session: { findFirst: mocks.sessionFindFirst },
    webhook: { findMany: mocks.webhookFindMany, findFirst: mocks.webhookFindFirst },
    webhookDelivery: { findFirst: mocks.deliveryFindFirst, create: mocks.deliveryCreate },
    auditLog: { create: mocks.auditCreate },
  },
}));

import { listWebhookEndpoints, replayWebhookDelivery } from "./webhook-service";

const actor = { id: "user-a", role: "USER" as const, ownerId: null, email: "user-a@example.com" };
const endpoint = {
  id: "endpoint-a",
  userId: "owner-a",
  tenantId: "tenant-a",
  sessionId: "session-db-a",
  name: "Receiver",
  url: "https://receiver.example/hook",
  isActive: true,
  payloadVersion: "2026-09-04",
  maxAttempts: 8,
  timeoutMs: 10000,
  secretVersion: 2,
  secretRotatedAt: new Date("2026-09-04T00:00:00Z"),
  previousSecretExpiresAt: null,
  secretCiphertext: "must-never-be-returned",
  secretIv: "iv",
  secretTag: "tag",
  createdAt: new Date("2026-09-04T00:00:00Z"),
  updatedAt: new Date("2026-09-04T00:00:00Z"),
  subscriptions: [{ eventType: "message.received" }],
  deliveries: [],
  _count: { deliveries: 0 },
};

describe("webhook tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canAccessSession.mockResolvedValue(true);
    mocks.resolveTenantId.mockResolvedValue("tenant-a");
    mocks.sessionFindFirst.mockResolvedValue({ id: "session-db-a", sessionId: "device-a", userId: "tenant-a" });
    mocks.webhookFindMany.mockResolvedValue([endpoint]);
    mocks.webhookFindFirst.mockResolvedValue(endpoint);
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("always applies tenant and session filters and strips encrypted secret fields", async () => {
    const result = await listWebhookEndpoints(actor, "device-a");
    expect(mocks.webhookFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", OR: [{ sessionId: "session-db-a" }, { sessionId: null }] },
    }));
    expect(result[0]).toMatchObject({ id: "endpoint-a", events: ["message.received"], hasSecret: true });
    expect(result[0]).not.toHaveProperty("secretCiphertext");
    expect(result[0]).not.toHaveProperty("secretIv");
    expect(result[0]).not.toHaveProperty("secretTag");
  });

  it("cannot replay a guessed delivery outside the selected tenant endpoint", async () => {
    mocks.deliveryFindFirst.mockResolvedValue(null);
    await expect(replayWebhookDelivery(actor, "device-a", "endpoint-a", "delivery-from-tenant-b"))
      .rejects.toMatchObject({ code: "WEBHOOK_DELIVERY_NOT_FOUND", status: 404 });
    expect(mocks.webhookFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a" }) }));
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });
});
