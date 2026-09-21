-- Phase 9: durable runtime observability, operational alerts, entitlement overrides,
-- and a dedicated Contact Form 7 integration identity.

ALTER TABLE `IntegrationToken`
  MODIFY `type` ENUM('GOOGLE_FORMS', 'WORDPRESS', 'CONTACT_FORM_7', 'WOOCOMMERCE') NOT NULL;

CREATE TABLE `TenantEntitlementOverride` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `feature` ENUM('API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY', 'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY', 'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES') NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `limitValue` BIGINT NULL,
  `reason` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TenantEntitlementOverride_tenantId_feature_key` (`tenantId`, `feature`),
  INDEX `TenantEntitlementOverride_expiresAt_idx` (`expiresAt`),
  INDEX `TenantEntitlementOverride_createdById_createdAt_idx` (`createdById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RuntimeHeartbeat` (
  `id` VARCHAR(191) NOT NULL,
  `instanceId` VARCHAR(191) NOT NULL,
  `processType` ENUM('WEB', 'MESSAGE_WORKER', 'SCHEDULE_WORKER', 'BROADCAST_WORKER', 'CAMPAIGN_WORKER', 'AUTOREPLY_WORKER', 'WEBHOOK_WORKER') NOT NULL,
  `status` ENUM('STARTING', 'HEALTHY', 'DEGRADED', 'STOPPING') NOT NULL DEFAULT 'STARTING',
  `hostname` VARCHAR(191) NOT NULL,
  `pid` INTEGER NOT NULL,
  `version` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `heartbeatAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `stoppedAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `lastErrorCode` VARCHAR(191) NULL,
  `lastErrorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RuntimeHeartbeat_instanceId_key` (`instanceId`),
  INDEX `RuntimeHeartbeat_processType_heartbeatAt_idx` (`processType`, `heartbeatAt`),
  INDEX `RuntimeHeartbeat_status_heartbeatAt_idx` (`status`, `heartbeatAt`),
  INDEX `RuntimeHeartbeat_hostname_processType_idx` (`hostname`, `processType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OperationalAlert` (
  `id` VARCHAR(191) NOT NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
  `status` ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `occurrences` INTEGER NOT NULL DEFAULT 1,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cooldownUntil` DATETIME(3) NULL,
  `acknowledgedByEmail` VARCHAR(191) NULL,
  `acknowledgedAt` DATETIME(3) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `meta` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `OperationalAlert_fingerprint_key` (`fingerprint`),
  INDEX `OperationalAlert_status_severity_lastSeenAt_idx` (`status`, `severity`, `lastSeenAt`),
  INDEX `OperationalAlert_kind_source_lastSeenAt_idx` (`kind`, `source`, `lastSeenAt`),
  INDEX `OperationalAlert_cooldownUntil_idx` (`cooldownUntil`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TenantEntitlementOverride`
  ADD CONSTRAINT `TenantEntitlementOverride_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantEntitlementOverride_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
