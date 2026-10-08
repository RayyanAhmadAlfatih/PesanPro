import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ collectReadinessSnapshot: vi.fn() }));

vi.mock("@/lib/operations", () => ({ collectReadinessSnapshot: mocks.collectReadinessSnapshot }));

import { GET } from "./route";

describe("public readiness probe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never leaks the storage path, disk capacity, or heartbeat timestamps", async () => {
    mocks.collectReadinessSnapshot.mockResolvedValue({
      ok: true,
      timestamp: new Date("2026-10-07T00:00:00.000Z"),
      checks: {
        web: { ok: true },
        database: { ok: true, latencyMs: 2 },
        storage: {
          ok: true,
          latencyMs: 2,
          path: "/www/wwwroot/PesanPro/data/private-media",
          freeBytes: "8489668608",
          totalBytes: "63290032128",
        },
        processes: [{ processType: "WEB", ok: true, lastHeartbeatAt: new Date("2026-10-07T00:00:00.000Z") }],
      },
    });

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(serialized).not.toContain("/www/");
    expect(serialized).not.toContain("freeBytes");
    expect(serialized).not.toContain("totalBytes");
    expect(serialized).not.toContain("lastHeartbeatAt");
    expect(body.checks.processes).toEqual([{ processType: "WEB", ok: true }]);
  });

  it("maps a not-ready snapshot to HTTP 503 with a safe body", async () => {
    mocks.collectReadinessSnapshot.mockResolvedValue({
      ok: false,
      timestamp: new Date("2026-10-07T00:00:00.000Z"),
      checks: {
        web: { ok: true },
        database: { ok: false, latencyMs: 5 },
        storage: { ok: true, latencyMs: 1 },
        processes: [],
      },
    });

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "not_ready", check: "readiness", ok: false });
  });

  it("stays 503 and never surfaces an exception when the snapshot throws", async () => {
    mocks.collectReadinessSnapshot.mockRejectedValue(new Error("db down"));

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "not_ready", errorCode: "READINESS_CHECK_FAILED" });
  });
});
