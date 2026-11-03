/* QA seed for the sandbox database: one tenant, one plan, one session, one API key. */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  const tenantEmail = "qa-tenant@example.com";
  const adminEmail = "qa-admin@example.com";

  const existingTenant = await prisma.user.findUnique({ where: { email: tenantEmail } });
  if (existingTenant) {
    console.log("Seed already applied");
    return;
  }

  const planEntitlements = [
    { feature: "API_ACCESS", enabled: true, limitValue: null },
    { feature: "API_KEYS", enabled: true, limitValue: BigInt(10) },
    { feature: "DEVICES", enabled: true, limitValue: BigInt(3) },
    { feature: "MESSAGES_MONTHLY", enabled: true, limitValue: BigInt(12000) },
    { feature: "API_REQUESTS_MONTHLY", enabled: true, limitValue: null },
    { feature: "API_REQUESTS_PER_MINUTE", enabled: true, limitValue: BigInt(60) },
    { feature: "SCHEDULED_MESSAGES", enabled: true, limitValue: BigInt(100) },
    { feature: "BROADCASTS_MONTHLY", enabled: true, limitValue: BigInt(20) },
    { feature: "BROADCAST_RECIPIENTS_PER_BATCH", enabled: true, limitValue: BigInt(500) },
    { feature: "BROADCAST_MIN_DELAY_MS", enabled: true, limitValue: BigInt(2000) },
    { feature: "AUTOREPLY_RULES", enabled: true, limitValue: BigInt(10) },
    { feature: "WEBHOOKS", enabled: true, limitValue: BigInt(5) },
    { feature: "MEDIA_STORAGE_BYTES", enabled: true, limitValue: BigInt(5 * 1024 * 1024 * 1024) },
    { feature: "MEDIA_MAX_UPLOAD_BYTES", enabled: true, limitValue: BigInt(75 * 1024 * 1024) },
  ];

  const plan = await prisma.plan.upsert({
    where: { code: "BISNIS" },
    update: {},
    create: {
      code: "BISNIS",
      name: "Bisnis",
      description: "QA plan",
      priceMonthly: "49000",
      priceYearly: "490000",
      currency: "IDR",
      isActive: true,
      isDefault: false,
      entitlements: { create: planEntitlements },
    },
  });

  const entitlementCount = await prisma.entitlement.count({ where: { planId: plan.id } });
  if (entitlementCount === 0) {
    for (const entitlement of planEntitlements) {
      await prisma.entitlement.create({ data: { planId: plan.id, ...entitlement } });
    }
  }

  const tenantPasswordHash = await bcrypt.hash("QaTenant#2026", 10);
  const tenant = await prisma.user.create({
    data: {
      email: tenantEmail,
      name: "QA Tenant",
      password: tenantPasswordHash,
      role: "USER",
      status: "ACTIVE",
      subscription: {
        create: {
          planId: plan.id,
          status: "ACTIVE",
          startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          graceEndsAt: null,
          trialEndsAt: null,
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      email: adminEmail,
      name: "QA Admin",
      password: await bcrypt.hash("QaAdmin#2026", 10),
      role: "SUPERADMIN",
      status: "ACTIVE",
    },
  });

  const session = await prisma.session.create({
    data: {
      userId: tenant.id,
      name: "CS QA Utama",
      sessionId: "cs-qa-1",
      status: "STOPPED",
    },
  });

  const rawApiKey = "wag_qa_test_key_0001";
  const scopes = [
    "message:send", "message:read", "media:read", "media:write",
    "schedule:read", "schedule:write", "broadcast:read", "broadcast:write",
    "autoreply:read", "autoreply:write", "webhook:read", "webhook:write",
  ];
  await prisma.apiKey.create({
    data: {
      userId: tenant.id,
      name: "QA full scope",
      keyHash: sha256(rawApiKey),
      preview: `${rawApiKey.slice(0, 8)}...${rawApiKey.slice(-4)}`,
      scopes,
      ipAllowlist: undefined,
    },
  });

  console.log(JSON.stringify({ tenantId: tenant.id, sessionId: session.id, apiKey: rawApiKey }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
