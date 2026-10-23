import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression coverage for the 2026-10-16 pre-launch QA fixes:
// - T-2: public readiness payload must not leak internals
// - T-8: NaN ?limit on webhook delivery logs must fall back to the default
const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  collectReadinessSnapshot: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  canAccessSession: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  canAccessSession: mocks.canAccessSession,
}));
vi.mock("@/lib/operations", () => ({ collectReadinessSnapshot: mocks.collectReadinessSnapshot }));
vi.mock("@/lib/webhook-service", () => ({ listWebhookDeliveries: mocks.listWebhookDeliveries }));

import { GET as readiness } from "@/app/api/health/ready/route";
import { GET as webhookLogs } from "@/app/api/webhooks/[sessionId]/[id]/logs/route";

describe("QA fix regressions (2026-10-16)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("T-2: public readiness response carries no storage path, disk metrics, or worker topology", async () => {
    mocks.collectReadinessSnapshot.mockResolvedValue({
      ok: true,
      timestamp: "2026-10-16T00:00:00.000Z",
      checks: {
        web: { ok: true },
        database: { ok: true, latencyMs: 2 },
        storage: { ok: true, latencyMs: 5, path: "/srv/private-media", freeBytes: "123", totalBytes: "456" },
        processes: [{ processType: "MESSAGE_WORKER", ok: true }],
      },
    });
    const response = await readiness();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", check: "readiness", ok: true, timestamp: "2026-10-16T00:00:00.000Z" });
    expect(JSON.stringify(body)).not.toContain("/srv/private-media");
    expect(JSON.stringify(body)).not.toContain("MESSAGE_WORKER");
  });

  it("T-8: webhook delivery logs tolerate a non-numeric limit and keep serving the default", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "u1", role: "USER", ownerId: null, email: "a@b.c" });
    mocks.listWebhookDeliveries.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest("http://localhost/api/webhooks/sess/hook1/logs?limit=abc");
    const response = await webhookLogs(request, { params: Promise.resolve({ sessionId: "sess", id: "hook1" }) });
    expect(response.status).toBe(200);
    expect(mocks.listWebhookDeliveries).toHaveBeenCalledWith(
      expect.anything(),
      "sess",
      "hook1",
      { limit: 50, offset: 0 },
    );
  });

});
