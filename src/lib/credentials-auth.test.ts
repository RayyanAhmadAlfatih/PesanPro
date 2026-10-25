import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  compare: vi.fn(),
  rate: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.10"),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/rate-limit", () => ({
  checkPersistentRateLimit: mocks.rate,
  getClientIp: mocks.getClientIp,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.audit }));

import { authorizeCredentials } from "./credentials-auth";

const activeUser = {
  id: "user-a",
  email: "user-a@example.com",
  password: "hashed",
  status: "ACTIVE",
  role: "USER",
};

describe("roadmap L1 credentials authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, resetAt: new Date() });
    mocks.findUnique.mockResolvedValue(activeUser);
    mocks.compare.mockResolvedValue(true);
  });

  it("[L1-10] accepts valid credentials", async () => {
    await expect(authorizeCredentials(
      { email: "USER-A@example.com", password: "StrongPass123" },
      new Request("https://pesanpro.example/auth", { headers: { "user-agent": "vitest" } }),
    )).resolves.toEqual(activeUser);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { email: "user-a@example.com" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "user.login" }));
  });

  it("[L1-11] rejects a wrong password", async () => {
    mocks.compare.mockResolvedValue(false);
    await expect(authorizeCredentials({ email: activeUser.email, password: "WrongPass123" })).resolves.toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.login_failed",
      meta: { reason: "invalid_credentials" },
    }));
  });

  it("[L1-12] rejects a nonexistent account with the same null auth result", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(authorizeCredentials({ email: "missing@example.com", password: "StrongPass123" })).resolves.toBeNull();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.login_failed",
      meta: { reason: "invalid_credentials" },
    }));
  });

  it("[L1-13] stops authentication when the persistent login rate limit is exceeded", async () => {
    mocks.rate.mockResolvedValue({ success: false, remaining: 0, resetAt: new Date() });
    await expect(authorizeCredentials({ email: activeUser.email, password: "StrongPass123" })).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      meta: { reason: "rate_limited" },
    }));
  });

  it("[L1-23] rejects suspended users before password comparison", async () => {
    mocks.findUnique.mockResolvedValue({ ...activeUser, status: "SUSPENDED" });
    await expect(authorizeCredentials({ email: activeUser.email, password: "StrongPass123" })).resolves.toBeNull();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      meta: { reason: "account_inactive" },
    }));
  });

  it("[L1-24] accepts the same account again after reactivation", async () => {
    mocks.findUnique.mockResolvedValue({ ...activeUser, status: "ACTIVE" });
    await expect(authorizeCredentials({ email: activeUser.email, password: "StrongPass123" })).resolves.toMatchObject({
      id: "user-a",
      status: "ACTIVE",
    });
  });
});
