import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rate: vi.fn(),
  config: vi.fn(),
  findUser: vi.fn(),
  createUser: vi.fn(),
  hash: vi.fn(),
  audit: vi.fn(),
  provision: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.rate,
  getClientIp: vi.fn(() => "203.0.113.10"),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemConfig: { findUnique: mocks.config },
    user: { findUnique: mocks.findUser },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      user: { create: mocks.createUser },
    })),
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/billing", () => ({ provisionDefaultSubscriptionInTransaction: mocks.provision }));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("https://pesanpro.example/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { name: "User A", email: "user-a@example.com", password: "StrongPass123" };

describe("roadmap L1 registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, resetAt: new Date() });
    mocks.config.mockResolvedValue({ enableRegistration: true });
    mocks.findUser.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.createUser.mockResolvedValue({ id: "user-a", name: "User A", email: valid.email });
    mocks.provision.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("[L1-01] registers a valid account", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, user: { email: valid.email } });
    expect(mocks.createUser).toHaveBeenCalled();
    expect(mocks.provision).toHaveBeenCalled();
  });

  it.each([
    ["L1-02", { ...valid, name: "A" }],
    ["L1-03", { ...valid, email: "not-an-email" }],
    ["L1-04", { ...valid, password: "Abc123" }],
    ["L1-05", { ...valid, password: "lowercase123" }],
    ["L1-06", { ...valid, password: "UPPERCASE123" }],
    ["L1-07", { ...valid, password: "NoNumbersHere" }],
  ])("[%s] rejects invalid registration input", async (_id, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("[L1-09] rejects an existing email without returning account data", async () => {
    mocks.findUser.mockResolvedValue({ id: "existing-user" });
    const response = await POST(request(valid));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).not.toHaveProperty("user");
    expect(JSON.stringify(body)).not.toContain("existing-user");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("[L1-25] blocks new registrations when registration is disabled", async () => {
    mocks.config.mockResolvedValue({ enableRegistration: false });
    const response = await POST(request(valid));
    expect(response.status).toBe(403);
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("[L1-26] accepts registration again after the setting is enabled", async () => {
    mocks.config.mockResolvedValue({ enableRegistration: true });
    expect((await POST(request(valid))).status).toBe(200);
  });
});
