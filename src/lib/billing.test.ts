import { describe, expect, it, vi } from "vitest";
import { deriveSubscriptionStatus, getEffectiveEntitlement, isSubscriptionUsable, provisionDefaultSubscriptionInTransaction } from "./billing";

const now = new Date("2026-08-29T00:00:00.000Z");

describe("billing subscription policy", () => {
  it("keeps active and unexpired trials usable", () => {
    const status = deriveSubscriptionStatus({
      status: "TRIAL",
      trialEndsAt: new Date("2026-08-30T00:00:00.000Z"),
      endsAt: null,
      graceEndsAt: null,
    }, now);
    expect(status).toBe("TRIAL");
    expect(isSubscriptionUsable(status)).toBe(true);
  });

  it("moves an expired subscription into grace period when configured", () => {
    const status = deriveSubscriptionStatus({
      status: "ACTIVE",
      trialEndsAt: null,
      endsAt: new Date("2026-08-28T00:00:00.000Z"),
      graceEndsAt: new Date("2026-09-05T00:00:00.000Z"),
    }, now);
    expect(status).toBe("GRACE_PERIOD");
    expect(isSubscriptionUsable(status)).toBe(true);
  });

  it("expires access after the grace period", () => {
    const status = deriveSubscriptionStatus({
      status: "ACTIVE",
      trialEndsAt: null,
      endsAt: new Date("2026-08-20T00:00:00.000Z"),
      graceEndsAt: new Date("2026-08-28T00:00:00.000Z"),
    }, now);
    expect(status).toBe("EXPIRED");
    expect(isSubscriptionUsable(status)).toBe(false);
  });

  it("never reactivates explicitly suspended subscriptions", () => {
    expect(deriveSubscriptionStatus({
      status: "SUSPENDED",
      trialEndsAt: null,
      endsAt: null,
      graceEndsAt: null,
    }, now)).toBe("SUSPENDED");
  });

  it("auto-provisions the default trial for a self-registered user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const createSubscription = vi.fn().mockImplementation(async ({ data }) => ({ id: "subscription-1", ...data }));
    const createHistory = vi.fn().mockResolvedValue({ id: "history-1" });
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue({ role: "USER" }) },
      subscription: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: createSubscription,
      },
      plan: { findFirst: vi.fn().mockResolvedValue({ id: "plan-trial", trialDays: 14 }) },
      subscriptionHistory: { create: createHistory },
    };

    try {
      await expect(provisionDefaultSubscriptionInTransaction(client as never, "user-1")).resolves.toMatchObject({
        userId: "user-1",
        planId: "plan-trial",
        status: "TRIAL",
      });
      expect(createSubscription).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          planId: "plan-trial",
          status: "TRIAL",
          startsAt: now,
          trialEndsAt: new Date("2026-09-12T00:00:00.000Z"),
          endsAt: new Date("2026-09-12T00:00:00.000Z"),
        }),
      });
      expect(createHistory).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          planId: "plan-trial",
          status: "TRIAL",
          reason: "default_provisioning",
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses an active tenant override before the plan entitlement", async () => {
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE", deviceLimit: 1 }) },
      subscription: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", trialEndsAt: null, endsAt: null, graceEndsAt: null, plan: { isActive: true, entitlements: [{ enabled: true, limitValue: BigInt(100) }] } }) },
      tenantEntitlementOverride: { findUnique: vi.fn().mockResolvedValue({ enabled: false, limitValue: BigInt(0), expiresAt: new Date("2099-01-01T00:00:00.000Z") }) },
    };

    await expect(getEffectiveEntitlement("user-1", "MESSAGES_MONTHLY", client as never)).resolves.toEqual({
      feature: "MESSAGES_MONTHLY",
      enabled: false,
      limit: BigInt(0),
      source: "OVERRIDE",
    });
  });

  it("ignores an expired override and falls back to the plan", async () => {
    const client = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", role: "USER", status: "ACTIVE", deviceLimit: 1 }) },
      subscription: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE", trialEndsAt: null, endsAt: null, graceEndsAt: null, plan: { isActive: true, entitlements: [{ enabled: true, limitValue: BigInt(100) }] } }) },
      tenantEntitlementOverride: { findUnique: vi.fn().mockResolvedValue({ enabled: false, limitValue: BigInt(0), expiresAt: new Date("2000-01-01T00:00:00.000Z") }) },
    };

    await expect(getEffectiveEntitlement("user-1", "MESSAGES_MONTHLY", client as never)).resolves.toEqual({
      feature: "MESSAGES_MONTHLY",
      enabled: true,
      limit: BigInt(100),
      source: "PLAN",
    });
  });
});
