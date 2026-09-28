import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  reset: vi.fn(),
  rate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({ requestPasswordReset: mocks.reset }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.rate,
  getClientIp: vi.fn(() => "203.0.113.10"),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));

import { POST } from "./route";

function request(email: string) {
  return new NextRequest("https://pesanpro.example/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("roadmap L1 forgot password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, resetAt: new Date() });
    mocks.reset.mockResolvedValue({ accepted: true });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("[L1-16] accepts a valid password reset request", async () => {
    const response = await POST(request("user-a@example.com"));
    expect(response.status).toBe(200);
    expect(mocks.reset).toHaveBeenCalledWith("user-a@example.com");
  });

  it("[L1-17] keeps the public response identical for an unknown email", async () => {
    const known = await POST(request("known@example.com"));
    const knownBody = await known.json();
    mocks.reset.mockClear();

    const unknown = await POST(request("unknown@example.com"));
    const unknownBody = await unknown.json();

    expect(unknown.status).toBe(known.status);
    expect(unknownBody).toEqual(knownBody);
  });
});
