-- Phase 2: plans, subscriptions, entitlements, multi-key API access, usage, and persistent rate limiting.

ALTER TABLE `User` ADD COLUMN `allowStaffApiKeys` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `Plan` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `trialDays` INTEGER NOT NULL DEFAULT 0,
  `priceMonthly` DECIMAL(18, 2) NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Plan_code_key`(`code`),
  INDEX `Plan_isActive_isDefault_idx`(`isActive`, `isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Entitlement` (
  `id` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `limitValue` BIGINT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Entitlement_planId_feature_key`(`planId`, `feature`),
  INDEX `Entitlement_feature_idx`(`feature`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Entitlement_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Subscription` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `status` ENUM('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'TRIAL',
  `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `trialEndsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `graceEndsAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Subscription_userId_key`(`userId`),
  INDEX `Subscription_planId_status_idx`(`planId`, `status`),
  INDEX `Subscription_status_endsAt_idx`(`status`, `endsAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Subscription_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Subscription_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SubscriptionHistory` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `status` ENUM('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'CANCELLED') NOT NULL,
  `reason` VARCHAR(191) NULL,
  `startsAt` DATETIME(3) NOT NULL,
  `endsAt` DATETIME(3) NULL,
  `graceEndsAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `SubscriptionHistory_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `SubscriptionHistory_planId_status_idx`(`planId`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SubscriptionHistory_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SubscriptionHistory_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApiKey` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `preview` VARCHAR(191) NOT NULL,
  `scopes` JSON NOT NULL,
  `ipAllowlist` JSON NULL,
  `expiresAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ApiKey_keyHash_key`(`keyHash`),
  INDEX `ApiKey_userId_revokedAt_idx`(`userId`, `revokedAt`),
  INDEX `ApiKey_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ApiKey_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UsageCounter` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `periodEnd` DATETIME(3) NOT NULL,
  `consumed` BIGINT NOT NULL DEFAULT 0,
  `reserved` BIGINT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `UsageCounter_tenantId_feature_periodStart_key`(`tenantId`, `feature`, `periodStart`),
  INDEX `UsageCounter_tenantId_periodEnd_idx`(`tenantId`, `periodEnd`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UsageCounter_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UsageLedger` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `counterId` VARCHAR(191) NULL,
  `apiKeyId` VARCHAR(191) NULL,
  `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL,
  `operation` ENUM('RESERVE', 'COMMIT', 'RELEASE', 'ADJUST') NOT NULL,
  `amount` BIGINT NOT NULL,
  `idempotencyKey` VARCHAR(191) NULL,
  `meta` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UsageLedger_tenantId_feature_operation_idempotencyKey_key`(`tenantId`, `feature`, `operation`, `idempotencyKey`),
  INDEX `UsageLedger_tenantId_feature_createdAt_idx`(`tenantId`, `feature`, `createdAt`),
  INDEX `UsageLedger_counterId_idx`(`counterId`),
  INDEX `UsageLedger_apiKeyId_createdAt_idx`(`apiKeyId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UsageLedger_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UsageLedger_apiKeyId_fkey`
    FOREIGN KEY (`apiKeyId`) REFERENCES `ApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RateLimitBucket` (
  `keyHash` VARCHAR(191) NOT NULL,
  `windowStart` DATETIME(3) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `RateLimitBucket_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`keyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PaymentVerification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NULL,
  `amount` DECIMAL(18, 2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'IDR',
  `reference` VARCHAR(191) NULL,
  `proofUrl` TEXT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewerEmail` VARCHAR(191) NULL,
  `reviewNote` TEXT NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PaymentVerification_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `PaymentVerification_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PaymentVerification_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PaymentVerification_planId_fkey`
    FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Default plans are deterministic so migration and lazy provisioning agree.
INSERT INTO `Plan` (`id`, `code`, `name`, `description`, `isActive`, `isDefault`, `trialDays`, `priceMonthly`, `currency`, `updatedAt`)
VALUES
  ('plan_trial', 'TRIAL', 'Trial', 'Default trial plan for new owners', true, true, 14, 0, 'IDR', CURRENT_TIMESTAMP(3)),
  ('plan_starter', 'STARTER', 'Starter', 'Starter plan; activate after pricing is configured', false, false, 0, NULL, 'IDR', CURRENT_TIMESTAMP(3));

INSERT INTO `Entitlement` (`id`, `planId`, `feature`, `enabled`, `limitValue`, `updatedAt`)
VALUES
  ('ent_trial_api_access', 'plan_trial', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3)),
  ('ent_trial_api_keys', 'plan_trial', 'API_KEYS', true, 2, CURRENT_TIMESTAMP(3)),
  ('ent_trial_devices', 'plan_trial', 'DEVICES', true, 1, CURRENT_TIMESTAMP(3)),
  ('ent_trial_staff', 'plan_trial', 'STAFF', true, 1, CURRENT_TIMESTAMP(3)),
  ('ent_trial_messages', 'plan_trial', 'MESSAGES_MONTHLY', true, 500, CURRENT_TIMESTAMP(3)),
  ('ent_trial_api_requests', 'plan_trial', 'API_REQUESTS_MONTHLY', true, 1000, CURRENT_TIMESTAMP(3)),
  ('ent_trial_schedules', 'plan_trial', 'SCHEDULED_MESSAGES', true, 10, CURRENT_TIMESTAMP(3)),
  ('ent_trial_broadcasts', 'plan_trial', 'BROADCASTS_MONTHLY', true, 2, CURRENT_TIMESTAMP(3)),
  ('ent_trial_campaigns', 'plan_trial', 'CAMPAIGNS_MONTHLY', true, 1, CURRENT_TIMESTAMP(3)),
  ('ent_trial_webhooks', 'plan_trial', 'WEBHOOKS', true, 1, CURRENT_TIMESTAMP(3)),
  ('ent_trial_media', 'plan_trial', 'MEDIA_STORAGE_BYTES', true, 104857600, CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_access', 'plan_starter', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_keys', 'plan_starter', 'API_KEYS', true, 5, CURRENT_TIMESTAMP(3)),
  ('ent_starter_devices', 'plan_starter', 'DEVICES', true, 3, CURRENT_TIMESTAMP(3)),
  ('ent_starter_staff', 'plan_starter', 'STAFF', true, 5, CURRENT_TIMESTAMP(3)),
  ('ent_starter_messages', 'plan_starter', 'MESSAGES_MONTHLY', true, 10000, CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_requests', 'plan_starter', 'API_REQUESTS_MONTHLY', true, 50000, CURRENT_TIMESTAMP(3)),
  ('ent_starter_schedules', 'plan_starter', 'SCHEDULED_MESSAGES', true, 100, CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcasts', 'plan_starter', 'BROADCASTS_MONTHLY', true, 20, CURRENT_TIMESTAMP(3)),
  ('ent_starter_campaigns', 'plan_starter', 'CAMPAIGNS_MONTHLY', true, 10, CURRENT_TIMESTAMP(3)),
  ('ent_starter_webhooks', 'plan_starter', 'WEBHOOKS', true, 5, CURRENT_TIMESTAMP(3)),
  ('ent_starter_media', 'plan_starter', 'MEDIA_STORAGE_BYTES', true, 5368709120, CURRENT_TIMESTAMP(3));

-- Existing owners receive a fresh trial from the deployment date. Staff inherit their owner's subscription.
INSERT INTO `Subscription` (`id`, `userId`, `planId`, `status`, `startsAt`, `trialEndsAt`, `endsAt`, `updatedAt`)
SELECT
  CONCAT('sub_', LEFT(SHA2(`id`, 256), 24)),
  `id`,
  'plan_trial',
  'TRIAL',
  CURRENT_TIMESTAMP(3),
  DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 14 DAY),
  DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 14 DAY),
  CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `role` = 'OWNER';

INSERT INTO `SubscriptionHistory` (`id`, `userId`, `planId`, `status`, `reason`, `startsAt`, `endsAt`)
SELECT
  CONCAT('subh_', LEFT(SHA2(`id`, 256), 24)),
  `id`,
  'plan_trial',
  'TRIAL',
  'phase2_backfill',
  CURRENT_TIMESTAMP(3),
  DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 14 DAY)
FROM `User`
WHERE `role` = 'OWNER';

-- Preserve already-hashed Phase 1 keys while moving them to the multi-key table.
INSERT INTO `ApiKey` (`id`, `userId`, `name`, `keyHash`, `preview`, `scopes`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('key_', LEFT(SHA2(CONCAT(`id`, `apiKey`), 256), 24)),
  `id`,
  'Migrated legacy key',
  `apiKey`,
  COALESCE(`apiKeyPreview`, 'legacy-key'),
  JSON_ARRAY('device:read', 'device:write', 'message:read', 'message:send', 'media:read', 'media:write', 'schedule:read', 'schedule:write', 'webhook:read', 'webhook:write'),
  COALESCE(`apiKeyCreatedAt`, CURRENT_TIMESTAMP(3)),
  CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `apiKey` IS NOT NULL;

-- Authentication now reads the multi-key table. Removing the compatibility
-- hash ensures revocation cannot fall through to the old column.
UPDATE `User`
SET `apiKey` = NULL, `apiKeyPreview` = NULL, `apiKeyCreatedAt` = NULL
WHERE `apiKey` IS NOT NULL;
