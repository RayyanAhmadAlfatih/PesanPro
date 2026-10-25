import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  rate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/password-reset", () => ({ consumePasswordReset: mocks.consume }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.rate,
  getClientIp: vi.fn(() => "203.0.113.10"),
  rateLimitHeaders: vi.fn(() => ({})),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));

import { POST } from "./route";

const token = "a".repeat(48);
function request(password = "StrongPass123") {
  return new NextRequest("https://pesanpro.example/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

describe("roadmap L1 reset password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("[L1-18] accepts a valid reset token", async () => {
    mocks.consume.mockResolvedValue({ success: true, userId: "user-a" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.password_reset_completed",
      userId: "user-a",
    }));
  });

  it("[L1-20] returns the same safe error for an invalid or expired token", async () => {
    mocks.consume.mockResolvedValue({ success: false });
    const response = await POST(request());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Reset link is invalid or expired" });
  });
});
