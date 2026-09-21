-- Phase 6: tenant-safe segmentation, immutable campaign versions, recipient snapshots,
-- and a one-to-one handoff into the durable Phase 5 broadcast queue.

ALTER TABLE `Contact`
  ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN `lastActivityAt` DATETIME(3) NULL,
  ADD COLUMN `customAttributes` JSON NULL;

CREATE INDEX `Contact_sessionId_consentStatus_lastActivityAt_idx`
  ON `Contact`(`sessionId`, `consentStatus`, `lastActivityAt`);
CREATE INDEX `Contact_sessionId_source_updatedAt_idx`
  ON `Contact`(`sessionId`, `source`, `updatedAt`);

CREATE TABLE `Segment` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `createKey` VARCHAR(191) NULL,
  `requestHash` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `definition` JSON NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Segment_tenantId_name_key`(`tenantId`, `name`),
  INDEX `Segment_tenantId_isActive_updatedAt_idx`(`tenantId`, `isActive`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Segment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Segment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactTag` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NOT NULL DEFAULT '#0f766e',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ContactTag_tenantId_name_key`(`tenantId`, `name`),
  INDEX `ContactTag_tenantId_updatedAt_idx`(`tenantId`, `updatedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ContactTag_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContactTag_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactTagAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `contactId` VARCHAR(191) NOT NULL,
  `tagId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ContactTagAssignment_contactId_tagId_key`(`contactId`, `tagId`),
  INDEX `ContactTagAssignment_tagId_createdAt_idx`(`tagId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ContactTagAssignment_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ContactTagAssignment_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `ContactTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Campaign` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `createKey` VARCHAR(191) NULL,
  `requestHash` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('DRAFT', 'SCHEDULED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
  `currentVersion` INTEGER NOT NULL DEFAULT 1,
  `scheduledAt` DATETIME(3) NULL,
  `timezone` VARCHAR(191) NULL,
  `lockedBy` VARCHAR(191) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `materializeAttempts` INTEGER NOT NULL DEFAULT 0,
  `total` INTEGER NOT NULL DEFAULT 0,
  `queued` INTEGER NOT NULL DEFAULT 0,
  `sent` INTEGER NOT NULL DEFAULT 0,
  `delivered` INTEGER NOT NULL DEFAULT 0,
  `read` INTEGER NOT NULL DEFAULT 0,
  `failed` INTEGER NOT NULL DEFAULT 0,
  `skipped` INTEGER NOT NULL DEFAULT 0,
  `unsubscribed` INTEGER NOT NULL DEFAULT 0,
  `cancelled` INTEGER NOT NULL DEFAULT 0,
  `startedAt` DATETIME(3) NULL,
  `pausedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `failedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Campaign_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
  INDEX `Campaign_status_scheduledAt_leaseExpiresAt_idx`(`status`, `scheduledAt`, `leaseExpiresAt`),
  UNIQUE INDEX `Campaign_tenantId_createKey_key`(`tenantId`, `createKey`),
  PRIMARY KEY (`id`),
  CONSTRAINT `Campaign_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Campaign_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CampaignVersion` (
  `id` VARCHAR(191) NOT NULL,
  `campaignId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `primarySessionId` VARCHAR(191) NOT NULL,
  `fallbackSessionId` VARCHAR(191) NULL,
  `fallbackPolicy` ENUM('PRIMARY_ONLY', 'USE_FALLBACK') NOT NULL DEFAULT 'PRIMARY_ONLY',
  `segmentId` VARCHAR(191) NULL,
  `mediaId` VARCHAR(191) NULL,
  `message` TEXT NOT NULL,
  `delayMinMs` INTEGER NOT NULL DEFAULT 2000,
  `delayMaxMs` INTEGER NOT NULL DEFAULT 3000,
  `requireOptIn` BOOLEAN NOT NULL DEFAULT false,
  `segmentDefinition` JSON NOT NULL,
  `configurationHash` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CampaignVersion_campaignId_version_key`(`campaignId`, `version`),
  INDEX `CampaignVersion_segmentId_createdAt_idx`(`segmentId`, `createdAt`),
  INDEX `CampaignVersion_primarySessionId_createdAt_idx`(`primarySessionId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CampaignVersion_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CampaignVersion_primarySessionId_fkey` FOREIGN KEY (`primarySessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CampaignVersion_fallbackSessionId_fkey` FOREIGN KEY (`fallbackSessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CampaignVersion_segmentId_fkey` FOREIGN KEY (`segmentId`) REFERENCES `Segment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CampaignVersion_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `PrivateMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CampaignRecipient` (
  `id` VARCHAR(191) NOT NULL,
  `campaignVersionId` VARCHAR(191) NOT NULL,
  `contactId` VARCHAR(191) NULL,
  `broadcastRecipientId` VARCHAR(191) NULL,
  `jid` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'HANDED_OFF', 'SKIPPED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `CampaignRecipient_broadcastRecipientId_key`(`broadcastRecipientId`),
  UNIQUE INDEX `CampaignRecipient_campaignVersionId_jid_key`(`campaignVersionId`, `jid`),
  INDEX `CampaignRecipient_campaignVersionId_status_position_idx`(`campaignVersionId`, `status`, `position`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CampaignRecipient_campaignVersionId_fkey` FOREIGN KEY (`campaignVersionId`) REFERENCES `CampaignVersion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CampaignRecipient_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CampaignRecipient_broadcastRecipientId_fkey` FOREIGN KEY (`broadcastRecipientId`) REFERENCES `BroadcastRecipient`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BroadcastLog`
  ADD COLUMN `campaignId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `BroadcastLog_campaignId_key` ON `BroadcastLog`(`campaignId`);

ALTER TABLE `BroadcastLog`
  ADD CONSTRAINT `BroadcastLog_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `Campaign`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
