-- Phase 5: durable broadcast orchestration, deterministic recipients, consent, and suppression.

ALTER TABLE `Contact`
  ADD COLUMN `consentStatus` ENUM('UNKNOWN', 'OPTED_IN', 'OPTED_OUT') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `consentAt` DATETIME(3) NULL,
  ADD COLUMN `consentSource` VARCHAR(191) NULL;

ALTER TABLE `BroadcastLog`
  ADD COLUMN `tenantId` VARCHAR(191) NULL,
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `sessionDbId` VARCHAR(191) NULL,
  ADD COLUMN `createKey` VARCHAR(191) NULL,
  ADD COLUMN `requestHash` VARCHAR(191) NULL,
  ADD COLUMN `name` VARCHAR(191) NULL,
  ADD COLUMN `mediaId` VARCHAR(191) NULL,
  ADD COLUMN `mediaType` VARCHAR(191) NULL,
  ADD COLUMN `skipped` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `cancelled` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `delayMaxMs` INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN `jitterSeed` VARCHAR(191) NULL,
  ADD COLUMN `requireOptIn` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `lockedBy` VARCHAR(191) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `heartbeatAt` DATETIME(3) NULL,
  ADD COLUMN `nextDispatchAt` DATETIME(3) NULL,
  ADD COLUMN `safeErrorCode` VARCHAR(191) NULL,
  ADD COLUMN `safeErrorMessage` TEXT NULL,
  ADD COLUMN `pausedAt` DATETIME(3) NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL,
  ADD COLUMN `failedAt` DATETIME(3) NULL,
  ADD COLUMN `createdAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `BroadcastLog` AS broadcast
LEFT JOIN `Session` AS sessionRow ON sessionRow.`sessionId` = broadcast.`sessionId`
SET
  broadcast.`tenantId` = sessionRow.`userId`,
  broadcast.`createdById` = sessionRow.`userId`,
  broadcast.`sessionDbId` = sessionRow.`id`,
  broadcast.`delayMaxMs` = GREATEST(broadcast.`delay`, broadcast.`delay` + FLOOR(broadcast.`delay` / 2)),
  broadcast.`jitterSeed` = SHA2(CONCAT(broadcast.`id`, ':legacy'), 256),
  broadcast.`nextDispatchAt` = COALESCE(broadcast.`completedAt`, broadcast.`startedAt`),
  broadcast.`createdAt` = broadcast.`startedAt`,
  broadcast.`status` = CASE
    WHEN LOWER(broadcast.`status`) = 'running' THEN 'RUNNING'
    WHEN LOWER(broadcast.`status`) = 'completed' THEN 'COMPLETED'
    WHEN LOWER(broadcast.`status`) IN ('cancelled', 'canceled') THEN 'CANCELLED'
    WHEN LOWER(broadcast.`status`) = 'paused' THEN 'PAUSED'
    ELSE 'FAILED'
  END;

ALTER TABLE `BroadcastLog`
  MODIFY COLUMN `status` ENUM('DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
  MODIFY COLUMN `jitterSeed` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `nextDispatchAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  MODIFY COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `BroadcastRecipient`
  ADD COLUMN `messageJobId` VARCHAR(191) NULL,
  ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `renderedMessage` TEXT NULL,
  ADD COLUMN `attempt` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `safeErrorCode` VARCHAR(191) NULL,
  ADD COLUMN `enqueuedAt` DATETIME(3) NULL,
  ADD COLUMN `skippedAt` DATETIME(3) NULL,
  ADD COLUMN `failedAt` DATETIME(3) NULL,
  ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `BroadcastRecipient`
SET `status` = CASE
  WHEN LOWER(`status`) = 'pending' THEN 'PENDING'
  WHEN LOWER(`status`) = 'sent' THEN 'SENT'
  WHEN LOWER(`status`) = 'failed' THEN 'FAILED'
  ELSE 'FAILED'
END;

ALTER TABLE `BroadcastRecipient`
  MODIFY COLUMN `status` ENUM('PENDING', 'CLAIMED', 'ENQUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';

CREATE UNIQUE INDEX `BroadcastLog_tenantId_createKey_key` ON `BroadcastLog`(`tenantId`, `createKey`);
CREATE INDEX `BroadcastLog_status_nextDispatchAt_idx` ON `BroadcastLog`(`status`, `nextDispatchAt`);
CREATE INDEX `BroadcastLog_status_leaseExpiresAt_idx` ON `BroadcastLog`(`status`, `leaseExpiresAt`);
CREATE INDEX `BroadcastLog_tenantId_createdAt_idx` ON `BroadcastLog`(`tenantId`, `createdAt`);
CREATE INDEX `BroadcastLog_sessionDbId_status_createdAt_idx` ON `BroadcastLog`(`sessionDbId`, `status`, `createdAt`);
CREATE UNIQUE INDEX `BroadcastRecipient_messageJobId_key` ON `BroadcastRecipient`(`messageJobId`);
CREATE INDEX `BroadcastRecipient_broadcastLogId_status_position_idx` ON `BroadcastRecipient`(`broadcastLogId`, `status`, `position`);
CREATE INDEX `BroadcastRecipient_status_updatedAt_idx` ON `BroadcastRecipient`(`status`, `updatedAt`);

ALTER TABLE `BroadcastLog`
  ADD CONSTRAINT `BroadcastLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BroadcastLog_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `BroadcastLog_sessionDbId_fkey` FOREIGN KEY (`sessionDbId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `BroadcastLog_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `PrivateMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `BroadcastRecipient`
  ADD CONSTRAINT `BroadcastRecipient_messageJobId_fkey` FOREIGN KEY (`messageJobId`) REFERENCES `MessageJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `SuppressionEntry` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `jid` VARCHAR(191) NOT NULL,
  `reason` ENUM('MANUAL', 'UNSUBSCRIBE', 'ADMIN') NOT NULL DEFAULT 'MANUAL',
  `sourceMessageId` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `removedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `SuppressionEntry_tenantId_jid_key`(`tenantId`, `jid`),
  INDEX `SuppressionEntry_tenantId_removedAt_createdAt_idx`(`tenantId`, `removedAt`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `SuppressionEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SuppressionEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
