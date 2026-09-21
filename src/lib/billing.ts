import {
  EntitlementFeature,
  Prisma,
  SubscriptionStatus,
  type Role,
} from "@prisma/client";
import { prisma } from "./prisma";
import { isCommercialFeatureVisible } from "./access-policy";

export const DEFAULT_TRIAL_PLAN_ID = "plan_trial";

type BillingClient = Prisma.TransactionClient;

export class EntitlementDeniedError extends Error {
  constructor(public readonly feature: EntitlementFeature) {
    super(`Feature ${feature} is not available for this subscription`);
    this.name = "EntitlementDeniedError";
  }
}

export class SubscriptionInactiveError extends Error {
  constructor(public readonly status: SubscriptionStatus | "MISSING") {
    super(`Subscription is ${status.toLowerCase()}`);
    this.name = "SubscriptionInactiveError";
  }
}

export interface EffectiveEntitlement {
  feature: EntitlementFeature;
  enabled: boolean;
  limit: bigint | null;
  source: "PLAN" | "OVERRIDE" | "SUPERADMIN" | "LEGACY_FALLBACK";
}

export function deriveSubscriptionStatus(
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    endsAt: Date | null;
    graceEndsAt: Date | null;
  },
  now = new Date(),
): SubscriptionStatus {
  if (["SUSPENDED", "CANCELLED", "EXPIRED"].includes(subscription.status)) {
    return subscription.status;
  }

  const primaryEnd = subscription.status === "TRIAL"
    ? subscription.trialEndsAt ?? subscription.endsAt
    : subscription.endsAt;

  if (!primaryEnd || primaryEnd > now) return subscription.status;
  if (subscription.graceEndsAt && subscription.graceEndsAt > now) return "GRACE_PERIOD";
  return "EXPIRED";
}

export function isSubscriptionUsable(status: SubscriptionStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE" || status === "GRACE_PERIOD";
}

const GRACE_RESTRICTED_FEATURES = new Set<EntitlementFeature>([
  "API_KEYS",
  "DEVICES",
  "STAFF",
  "MESSAGES_MONTHLY",
  "SCHEDULED_MESSAGES",
  "BROADCASTS_MONTHLY",
  "CAMPAIGNS_MONTHLY",
  "AUTOREPLY_RULES",
  "WEBHOOKS",
  "MEDIA_STORAGE_BYTES",
]);

async function getTenant(client: BillingClient, userId: string) {
  const actor = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, deviceLimit: true },
  });
  if (!actor || actor.status !== "ACTIVE") return null;
  return actor;
}

export async function resolveTenantId(userId: string, client: BillingClient = prisma): Promise<string | null> {
  return (await getTenant(client, userId))?.id ?? null;
}

function legacyFallback(
  feature: EntitlementFeature,
  tenant: { deviceLimit: number },
): EffectiveEntitlement {
  if (feature === "DEVICES") {
    return { feature, enabled: true, limit: BigInt(tenant.deviceLimit), source: "LEGACY_FALLBACK" };
  }
  return { feature, enabled: false, limit: BigInt(0), source: "LEGACY_FALLBACK" };
}

export async function getEffectiveEntitlement(
  userId: string,
  feature: EntitlementFeature,
  client: BillingClient = prisma,
): Promise<EffectiveEntitlement> {
  const tenant = await getTenant(client, userId);
  if (!tenant) throw new SubscriptionInactiveError("MISSING");

  if (tenant.role === "SUPERADMIN") {
    return { feature, enabled: true, limit: null, source: "SUPERADMIN" };
  }

  const subscription = await client.subscription.findUnique({
    where: { userId: tenant.id },
    include: { plan: { include: { entitlements: { where: { feature } } } } },
  });
  if (!subscription) return legacyFallback(feature, tenant);

  const status = deriveSubscriptionStatus(subscription);
  if (!isSubscriptionUsable(status)) throw new SubscriptionInactiveError(status);

  // Grace preserves read access and API observability while freezing new
  // billable resources and outbound work until the subscription is restored.
  if (status === "GRACE_PERIOD" && GRACE_RESTRICTED_FEATURES.has(feature)) {
    return { feature, enabled: false, limit: BigInt(0), source: "PLAN" };
  }

  const override = await client.tenantEntitlementOverride.findUnique({
    where: { tenantId_feature: { tenantId: tenant.id, feature } },
  });
  if (override && (!override.expiresAt || override.expiresAt > new Date())) {
    return { feature, enabled: override.enabled, limit: override.limitValue, source: "OVERRIDE" };
  }

  const entitlement = subscription.plan.entitlements[0];
  if (!subscription.plan.isActive || !entitlement) {
    return { feature, enabled: false, limit: BigInt(0), source: "PLAN" };
  }
  return {
    feature,
    enabled: entitlement.enabled,
    limit: entitlement.limitValue,
    source: "PLAN",
  };
}

export async function requireEntitlement(
  userId: string,
  feature: EntitlementFeature,
  client: BillingClient = prisma,
): Promise<EffectiveEntitlement> {
  const entitlement = await getEffectiveEntitlement(userId, feature, client);
  if (!entitlement.enabled) throw new EntitlementDeniedError(feature);
  return entitlement;
}

export async function provisionDefaultSubscriptionInTransaction(tx: BillingClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "USER") return null;

  const existing = await tx.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  const plan = await tx.plan.findFirst({
    where: { isDefault: true, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!plan) throw new Error("No active default plan is configured");

  const startsAt = new Date();
  const trialEndsAt = plan.trialDays > 0
    ? new Date(startsAt.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
    : null;
  const status: SubscriptionStatus = trialEndsAt ? "TRIAL" : "ACTIVE";

  const subscription = await tx.subscription.create({
    data: {
      userId,
      planId: plan.id,
      status,
      startsAt,
      trialEndsAt,
      endsAt: trialEndsAt,
    },
  });
  await tx.subscriptionHistory.create({
    data: {
      userId,
      planId: plan.id,
      status,
      reason: "default_provisioning",
      startsAt,
      endsAt: trialEndsAt,
    },
  });
  return subscription;
}

export async function provisionDefaultSubscription(userId: string) {
  return prisma.$transaction(async (tx) => {
    return provisionDefaultSubscriptionInTransaction(tx, userId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getBillingSnapshot(userId: string) {
  const tenant = await getTenant(prisma, userId);
  if (!tenant) return null;
  if (tenant.role === "SUPERADMIN") {
    return {
      tenantId: tenant.id,
      role: tenant.role,
      status: "ACTIVE" as const,
      plan: { id: null, code: "SUPERADMIN", name: "Superadmin", unlimited: true },
      entitlements: Object.values(EntitlementFeature)
        .filter(isCommercialFeatureVisible)
        .map((feature) => ({ feature, enabled: true, limit: null })),
    };
  }

  const [subscription, overrides] = await Promise.all([
    prisma.subscription.findUnique({
      where: { userId: tenant.id },
      include: { plan: { include: { entitlements: { orderBy: { feature: "asc" } } } } },
    }),
    prisma.tenantEntitlementOverride.findMany({
      where: { tenantId: tenant.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { feature: "asc" },
    }),
  ]);
  if (!subscription) return null;

  return {
    tenantId: tenant.id,
    role: tenant.role as Role,
    status: deriveSubscriptionStatus(subscription),
    startsAt: subscription.startsAt,
    trialEndsAt: subscription.trialEndsAt,
    endsAt: subscription.endsAt,
    graceEndsAt: subscription.graceEndsAt,
    plan: {
      id: subscription.plan.id,
      code: subscription.plan.code,
      name: subscription.plan.name,
      unlimited: false,
    },
    entitlements: subscription.plan.entitlements.filter((item) => isCommercialFeatureVisible(item.feature)).map((item) => {
      const override = overrides.find((candidate) => candidate.feature === item.feature);
      return {
        feature: item.feature,
        enabled: override?.enabled ?? item.enabled,
        limit: (override ? override.limitValue : item.limitValue)?.toString() ?? null,
        source: override ? "OVERRIDE" as const : "PLAN" as const,
      };
    }),
    overrides: overrides.filter((item) => isCommercialFeatureVisible(item.feature)).map((item) => ({
      id: item.id,
      feature: item.feature,
      enabled: item.enabled,
      limit: item.limitValue?.toString() ?? null,
      reason: item.reason,
      expiresAt: item.expiresAt,
    })),
  };
}
