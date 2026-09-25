export const ACTIVE_ACCOUNT_ROLES = ["SUPERADMIN", "USER"] as const;

export type ActiveAccountRole = (typeof ACTIVE_ACCOUNT_ROLES)[number];

const SUPERADMIN_DASHBOARD_PREFIXES = [
  "/dashboard/users",
  "/dashboard/commercial",
  "/dashboard/settings",
  "/dashboard/system-monitor",
  "/dashboard/notifications",
] as const;

const TENANT_DASHBOARD_PREFIXES = [
  "/dashboard/sessions",
  "/dashboard/chat",
  "/dashboard/message-queue",
  "/dashboard/broadcast",
  "/dashboard/campaigns",
  "/dashboard/media",
  "/dashboard/labels",
  "/dashboard/autoreply",
  "/dashboard/scheduler",
  "/dashboard/developer",
  "/dashboard/webhooks",
  "/dashboard/billing",
] as const;

const REMOVED_DASHBOARD_FEATURE_PREFIXES = [
  "/dashboard/sticker",
  "/dashboard/contacts",
  "/dashboard/groups",
  "/dashboard/bot-settings",
  "/dashboard/profile",
  "/dashboard/inbox",
] as const;

const LEGACY_COMMERCIAL_FEATURES = new Set(["STAFF"]);

export function isSuperadmin(role: unknown): role is "SUPERADMIN" {
  return role === "SUPERADMIN";
}

export function isActiveAccountRole(role: unknown): role is ActiveAccountRole {
  return typeof role === "string" && ACTIVE_ACCOUNT_ROLES.includes(role as ActiveAccountRole);
}

export function isSuperadminDashboardPath(pathname: string): boolean {
  return SUPERADMIN_DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isRemovedDashboardFeaturePath(pathname: string): boolean {
  return REMOVED_DASHBOARD_FEATURE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isTenantDashboardPath(pathname: string): boolean {
  return TENANT_DASHBOARD_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function canAccessDashboardPath(role: unknown, pathname: string): boolean {
  if (isRemovedDashboardFeaturePath(pathname)) return false;
  if (isSuperadmin(role)) return !isTenantDashboardPath(pathname);
  return !isSuperadminDashboardPath(pathname);
}

export function isCommercialFeatureVisible(feature: string): boolean {
  return !LEGACY_COMMERCIAL_FEATURES.has(feature);
}
