-- Phase 3: durable message queue, attempts, delivery events, idempotency, and private media metadata.

CREATE TABLE `PrivateMedia` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `uploaderId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `storedName` VARCHAR(191) NOT NULL,
  `storagePath` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `mediaType` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT') NOT NULL,
  `extension` VARCHAR(191) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `checksumSha256` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE', 'DELETED', 'QUARANTINED') NOT NULL DEFAULT 'ACTIVE',
  `expiresAt` DATETIME(3) NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PrivateMedia_storedName_key`(`storedName`),
  UNIQUE INDEX `PrivateMedia_storagePath_key`(`storagePath`),
  INDEX `PrivateMedia_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
  INDEX `PrivateMedia_expiresAt_status_idx`(`expiresAt`, `status`),
  INDEX `PrivateMedia_checksumSha256_idx`(`checksumSha256`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PrivateMedia_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PrivateMedia_uploaderId_fkey` FOREIGN KEY (`uploaderId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PrivateMedia_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MessageJob` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `requestedById` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `apiKeyId` VARCHAR(191) NULL,
  `mediaId` VARCHAR(191) NULL,
  `operation` VARCHAR(191) NOT NULL,
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `requestHash` VARCHAR(191) NOT NULL,
  `requestPayload` JSON NOT NULL,
  `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT') NOT NULL,
  `recipient` VARCHAR(191) NOT NULL,
  `text` TEXT NULL,
  `caption` TEXT NULL,
  `status` ENUM('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `priority` INTEGER NOT NULL DEFAULT 0,
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `lockedBy` VARCHAR(191) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `whatsappMessageId` VARCHAR(191) NULL,
  `quotaReservationKey` VARCHAR(191) NOT NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `lastErrorAt` DATETIME(3) NULL,
  `sentAt` DATETIME(3) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `readAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `deadLetteredAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `MessageJob_whatsappMessageId_key`(`whatsappMessageId`),
  UNIQUE INDEX `MessageJob_tenantId_operation_idempotencyKey_key`(`tenantId`, `operation`, `idempotencyKey`),
  INDEX `MessageJob_status_availableAt_priority_idx`(`status`, `availableAt`, `priority`),
  INDEX `MessageJob_status_leaseExpiresAt_idx`(`status`, `leaseExpiresAt`),
  INDEX `MessageJob_sessionId_status_createdAt_idx`(`sessionId`, `status`, `createdAt`),
  INDEX `MessageJob_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MessageJob_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MessageJob_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `MessageJob_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `MessageJob_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `ApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `MessageJob_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `PrivateMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MessageJobAttempt` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `attemptNumber` INTEGER NOT NULL,
  `workerId` VARCHAR(191) NOT NULL,
  `status` ENUM('PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PROCESSING',
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3) NULL,
  UNIQUE INDEX `MessageJobAttempt_jobId_attemptNumber_key`(`jobId`, `attemptNumber`),
  INDEX `MessageJobAttempt_status_startedAt_idx`(`status`, `startedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MessageJobAttempt_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `MessageJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MessageDeliveryEvent` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `type` ENUM('SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL,
  `whatsappMessageId` VARCHAR(191) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `payload` JSON NULL,
  UNIQUE INDEX `MessageDeliveryEvent_jobId_type_whatsappMessageId_key`(`jobId`, `type`, `whatsappMessageId`),
  INDEX `MessageDeliveryEvent_whatsappMessageId_occurredAt_idx`(`whatsappMessageId`, `occurredAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MessageDeliveryEvent_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `MessageJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `IdempotencyRecord` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `messageJobId` VARCHAR(191) NOT NULL,
  `operation` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `requestHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `IdempotencyRecord_messageJobId_key`(`messageJobId`),
  UNIQUE INDEX `IdempotencyRecord_tenantId_operation_key_key`(`tenantId`, `operation`, `key`),
  INDEX `IdempotencyRecord_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `IdempotencyRecord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `IdempotencyRecord_messageJobId_fkey` FOREIGN KEY (`messageJobId`) REFERENCES `MessageJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Message` ADD COLUMN `messageJobId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Message_messageJobId_key` ON `Message`(`messageJobId`);
ALTER TABLE `Message` ADD CONSTRAINT `Message_messageJobId_fkey`
  FOREIGN KEY (`messageJobId`) REFERENCES `MessageJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing Message rows remain unchanged. Their optional messageJobId is NULL,
-- preserving all legacy history while new queue-backed messages can be linked.
