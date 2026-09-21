-- Phase 8: encrypted webhook endpoints, durable transactional outbox delivery,
-- restart-safe retries/DLQ, and scoped integration tokens.

ALTER TABLE `Webhook`
  ADD COLUMN `tenantId` VARCHAR(191) NULL,
  MODIFY COLUMN `url` TEXT NOT NULL,
  MODIFY COLUMN `secret` TEXT NULL,
  ADD COLUMN `secretCiphertext` TEXT NULL,
  ADD COLUMN `secretIv` VARCHAR(191) NULL,
  ADD COLUMN `secretTag` VARCHAR(191) NULL,
  ADD COLUMN `previousSecretCiphertext` TEXT NULL,
  ADD COLUMN `previousSecretIv` VARCHAR(191) NULL,
  ADD COLUMN `previousSecretTag` VARCHAR(191) NULL,
  ADD COLUMN `previousSecretExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `secretVersion` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `secretRotatedAt` DATETIME(3) NULL,
  ADD COLUMN `payloadVersion` VARCHAR(191) NOT NULL DEFAULT '2026-09-04',
  ADD COLUMN `maxAttempts` INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN `timeoutMs` INTEGER NOT NULL DEFAULT 10000;

UPDATE `Webhook` AS webhook
INNER JOIN `User` AS creator ON creator.`id` = webhook.`userId`
SET webhook.`tenantId` = COALESCE(creator.`ownerId`, creator.`id`),
    webhook.`isActive` = false,
    webhook.`secret` = NULL;

ALTER TABLE `Webhook`
  MODIFY COLUMN `tenantId` VARCHAR(191) NOT NULL,
  ADD INDEX `Webhook_tenantId_isActive_createdAt_idx`(`tenantId`, `isActive`, `createdAt`),
  ADD INDEX `Webhook_sessionId_isActive_idx`(`sessionId`, `isActive`),
  ADD CONSTRAINT `Webhook_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `WebhookSubscription` (
  `id` VARCHAR(191) NOT NULL,
  `webhookId` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebhookSubscription_webhookId_eventType_key`(`webhookId`, `eventType`),
  INDEX `WebhookSubscription_eventType_isActive_idx`(`eventType`, `isActive`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebhookSubscription_webhookId_fkey`
    FOREIGN KEY (`webhookId`) REFERENCES `Webhook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebhookOutboxEvent` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `eventKey` VARCHAR(191) NOT NULL,
  `payloadVersion` VARCHAR(191) NOT NULL DEFAULT '2026-09-04',
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'DISPATCHED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `lockedBy` VARCHAR(191) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `dispatchedAt` DATETIME(3) NULL,
  `deadLetteredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebhookOutboxEvent_tenantId_eventKey_key`(`tenantId`, `eventKey`),
  INDEX `WebhookOutboxEvent_status_availableAt_idx`(`status`, `availableAt`),
  INDEX `WebhookOutboxEvent_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
  INDEX `WebhookOutboxEvent_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  INDEX `WebhookOutboxEvent_sessionId_eventType_createdAt_idx`(`sessionId`, `eventType`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebhookOutboxEvent_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `WebhookOutboxEvent_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebhookDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `webhookId` VARCHAR(191) NOT NULL,
  `deliveryKey` VARCHAR(191) NOT NULL,
  `replayOfId` VARCHAR(191) NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'RETRYING', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 8,
  `lockedBy` VARCHAR(191) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `responseStatusCode` INTEGER NULL,
  `responseTimeMs` INTEGER NULL,
  `responseSizeBytes` INTEGER NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `lastAttemptAt` DATETIME(3) NULL,
  `succeededAt` DATETIME(3) NULL,
  `deadLetteredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `WebhookDelivery_deliveryKey_key`(`deliveryKey`),
  INDEX `WebhookDelivery_status_availableAt_idx`(`status`, `availableAt`),
  INDEX `WebhookDelivery_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
  INDEX `WebhookDelivery_webhookId_createdAt_idx`(`webhookId`, `createdAt`),
  INDEX `WebhookDelivery_eventId_createdAt_idx`(`eventId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebhookDelivery_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `WebhookOutboxEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `WebhookDelivery_webhookId_fkey`
    FOREIGN KEY (`webhookId`) REFERENCES `Webhook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `WebhookDelivery_replayOfId_fkey`
    FOREIGN KEY (`replayOfId`) REFERENCES `WebhookDelivery`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebhookDeliveryAttempt` (
  `id` VARCHAR(191) NOT NULL,
  `deliveryId` VARCHAR(191) NOT NULL,
  `attemptNumber` INTEGER NOT NULL,
  `workerId` VARCHAR(191) NOT NULL,
  `status` ENUM('PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PROCESSING',
  `responseStatusCode` INTEGER NULL,
  `responseTimeMs` INTEGER NULL,
  `responseSizeBytes` INTEGER NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  UNIQUE INDEX `WebhookDeliveryAttempt_deliveryId_attemptNumber_key`(`deliveryId`, `attemptNumber`),
  INDEX `WebhookDeliveryAttempt_deliveryId_startedAt_idx`(`deliveryId`, `startedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `WebhookDeliveryAttempt_deliveryId_fkey`
    FOREIGN KEY (`deliveryId`) REFERENCES `WebhookDelivery`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `IntegrationToken` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('GOOGLE_FORMS', 'WORDPRESS', 'WOOCOMMERCE') NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `tokenPreview` VARCHAR(191) NOT NULL,
  `scopes` JSON NOT NULL,
  `mapping` JSON NULL,
  `expiresAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `IntegrationToken_tokenHash_key`(`tokenHash`),
  INDEX `IntegrationToken_tenantId_type_revokedAt_idx`(`tenantId`, `type`, `revokedAt`),
  INDEX `IntegrationToken_sessionId_revokedAt_idx`(`sessionId`, `revokedAt`),
  INDEX `IntegrationToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `IntegrationToken_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `IntegrationToken_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `IntegrationToken_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `IntegrationUsageLog` (
  `id` VARCHAR(191) NOT NULL,
  `tokenId` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `payloadHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `messageJobId` VARCHAR(191) NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `remoteIp` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `IntegrationUsageLog_tokenId_idempotencyKey_key`(`tokenId`, `idempotencyKey`),
  INDEX `IntegrationUsageLog_tokenId_createdAt_idx`(`tokenId`, `createdAt`),
  INDEX `IntegrationUsageLog_requestId_idx`(`requestId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `IntegrationUsageLog_tokenId_fkey`
    FOREIGN KEY (`tokenId`) REFERENCES `IntegrationToken`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
