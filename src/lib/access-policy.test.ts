import { describe, expect, it } from "vitest";
import {
  ACTIVE_ACCOUNT_ROLES,
  canAccessDashboardPath,
  isActiveAccountRole,
  isCommercialFeatureVisible,
  isRemovedDashboardFeaturePath,
  isSuperadmin,
  isSuperadminDashboardPath,
  isTenantDashboardPath,
} from "./access-policy";

describe("access policy", () => {
  it("recognizes only the two active account roles", () => {
    expect(ACTIVE_ACCOUNT_ROLES).toEqual(["SUPERADMIN", "USER"]);
    expect(isActiveAccountRole("SUPERADMIN")).toBe(true);
    expect(isActiveAccountRole("USER")).toBe(true);
    expect(isActiveAccountRole("STAFF")).toBe(false);
  });

  it("allows only superadmins to enter every administration page", () => {
    const protectedPaths = [
      "/dashboard/users",
      "/dashboard/users/example",
      "/dashboard/commercial",
      "/dashboard/settings",
      "/dashboard/system-monitor",
      "/dashboard/notifications",
    ];

    for (const path of protectedPaths) {
      expect(isSuperadminDashboardPath(path)).toBe(true);
      expect(canAccessDashboardPath("USER", path)).toBe(false);
      expect(canAccessDashboardPath("SUPERADMIN", path)).toBe(true);
    }
  });

  it("denies retired dashboard features for every role", () => {
    const removedPaths = [
      "/dashboard/sticker",
      "/dashboard/contacts",
      "/dashboard/groups",
      "/dashboard/bot-settings",
      "/dashboard/profile",
    ];

    for (const path of removedPaths) {
      expect(isRemovedDashboardFeaturePath(path)).toBe(true);
      expect(canAccessDashboardPath("USER", path)).toBe(false);
      expect(canAccessDashboardPath("SUPERADMIN", path)).toBe(false);
    }
  });

  it("keeps normal tenant pages available to authenticated users", () => {
    expect(canAccessDashboardPath("USER", "/dashboard")).toBe(true);
    expect(canAccessDashboardPath("USER", "/dashboard/billing")).toBe(true);
    expect(canAccessDashboardPath("USER", "/dashboard/developer")).toBe(true);
    expect(canAccessDashboardPath("USER", "/dashboard/media")).toBe(true);
    expect(canAccessDashboardPath("USER", "/dashboard/labels")).toBe(true);
    expect(isSuperadmin("USER")).toBe(false);
  });

  it("separates superadmin controls from tenant operational pages", () => {
    const tenantPaths = [
      "/dashboard/sessions",
      "/dashboard/chat",
      "/dashboard/autoreply",
      "/dashboard/media",
      "/dashboard/developer",
      "/dashboard/billing",
    ];
    for (const path of tenantPaths) {
      expect(isTenantDashboardPath(path)).toBe(true);
      expect(canAccessDashboardPath("USER", path)).toBe(true);
      expect(canAccessDashboardPath("SUPERADMIN", path)).toBe(false);
    }
    expect(canAccessDashboardPath("SUPERADMIN", "/dashboard")).toBe(true);
  });

  it("hides legacy commercial features without removing compatibility data", () => {
    expect(isCommercialFeatureVisible("STAFF")).toBe(false);
    expect(isCommercialFeatureVisible("DEVICES")).toBe(true);
  });
});
