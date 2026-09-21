-- Phase 7: deterministic auto-reply rules, durable inbound trigger processing,
-- restart-safe cooldowns, and idempotent handoff to the Phase 3 message queue.

ALTER TABLE `Entitlement`
  MODIFY COLUMN `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageCounter`
  MODIFY COLUMN `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageLedger`
  MODIFY COLUMN `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

INSERT INTO `Entitlement` (`id`, `planId`, `feature`, `enabled`, `limitValue`, `updatedAt`)
VALUES
  ('ent_trial_autoreply', 'plan_trial', 'AUTOREPLY_RULES', true, 5, CURRENT_TIMESTAMP(3)),
  ('ent_starter_autoreply', 'plan_starter', 'AUTOREPLY_RULES', true, 50, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `enabled` = VALUES(`enabled`),
  `limitValue` = VALUES(`limitValue`),
  `updatedAt` = VALUES(`updatedAt`);

UPDATE `AutoReply`
SET `matchType` = 'EXACT'
WHERE `matchType` NOT IN ('EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX', 'FALLBACK');

UPDATE `AutoReply`
SET `triggerType` = 'ALL'
WHERE `triggerType` NOT IN ('ALL', 'GROUP', 'PRIVATE');

ALTER TABLE `AutoReply`
  MODIFY COLUMN `matchType` ENUM('EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX', 'FALLBACK') NOT NULL,
  MODIFY COLUMN `triggerType` ENUM('ALL', 'GROUP', 'PRIVATE') NOT NULL DEFAULT 'ALL',
  MODIFY COLUMN `mediaUrl` TEXT NULL,
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `mediaId` VARCHAR(191) NULL,
  ADD COLUMN `name` VARCHAR(191) NULL,
  ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN `activeDays` JSON NULL,
  ADD COLUMN `activeStartTime` VARCHAR(191) NULL,
  ADD COLUMN `activeEndTime` VARCHAR(191) NULL,
  ADD COLUMN `cooldownSeconds` INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN `rateLimitCount` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `rateLimitWindowSeconds` INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN `maxChainDepth` INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN `isEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `deletedAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;

-- Existing remote-media and regex rules require an explicit safety review before
-- they can run through the durable worker.
UPDATE `AutoReply`
SET `isEnabled` = false,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE (`mediaUrl` IS NOT NULL AND `mediaId` IS NULL) OR `matchType` = 'REGEX';

UPDATE `AutoReply`
SET `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `updatedAt` IS NULL;

ALTER TABLE `AutoReply`
  MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;

CREATE INDEX `AutoReply_sessionId_isEnabled_deletedAt_priority_idx`
  ON `AutoReply`(`sessionId`, `isEnabled`, `deletedAt`, `priority`);
CREATE INDEX `AutoReply_createdById_createdAt_idx`
  ON `AutoReply`(`createdById`, `createdAt`);
CREATE INDEX `AutoReply_mediaId_idx`
  ON `AutoReply`(`mediaId`);

ALTER TABLE `AutoReply`
  ADD CONSTRAINT `AutoReply_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AutoReply_mediaId_fkey`
    FOREIGN KEY (`mediaId`) REFERENCES `PrivateMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `AutoReplyTriggerLog` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `ruleId` VARCHAR(191) NULL,
  `messageJobId` VARCHAR(191) NULL,
  `eventKey` VARCHAR(64) NOT NULL,
  `sourceMessageId` VARCHAR(191) NOT NULL,
  `sourceText` TEXT NULL,
  `recipientJid` VARCHAR(191) NOT NULL,
  `senderJid` VARCHAR(191) NOT NULL,
  `isGroup` BOOLEAN NOT NULL DEFAULT false,
  `ruleVersion` INTEGER NULL,
  `chainDepth` INTEGER NOT NULL DEFAULT 0,
  `snapshotResponse` TEXT NULL,
  `snapshotMediaId` VARCHAR(191) NULL,
  `snapshotMessageType` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT') NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'ENQUEUED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reasonCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `lockedBy` VARCHAR(191) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `enqueuedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AutoReplyTriggerLog_messageJobId_key`(`messageJobId`),
  UNIQUE INDEX `AutoReplyTriggerLog_sessionId_eventKey_key`(`sessionId`, `eventKey`),
  INDEX `AutoReplyTriggerLog_status_available_lease_idx`(`status`, `availableAt`, `leaseExpiresAt`, `createdAt`),
  INDEX `AutoReplyTriggerLog_tenantId_sessionId_createdAt_idx`(`tenantId`, `sessionId`, `createdAt`),
  INDEX `AutoReplyTriggerLog_ruleId_createdAt_idx`(`ruleId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AutoReplyTriggerLog_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AutoReplyTriggerLog_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AutoReplyTriggerLog_ruleId_fkey`
    FOREIGN KEY (`ruleId`) REFERENCES `AutoReply`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AutoReplyTriggerLog_messageJobId_fkey`
    FOREIGN KEY (`messageJobId`) REFERENCES `MessageJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AutoReplyCooldown` (
  `id` VARCHAR(191) NOT NULL,
  `ruleId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `contactJid` VARCHAR(191) NOT NULL,
  `windowStartedAt` DATETIME(3) NOT NULL,
  `triggerCount` INTEGER NOT NULL DEFAULT 0,
  `lastTriggeredAt` DATETIME(3) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AutoReplyCooldown_ruleId_contactJid_key`(`ruleId`, `contactJid`),
  INDEX `AutoReplyCooldown_sessionId_contactJid_expiresAt_idx`(`sessionId`, `contactJid`, `expiresAt`),
  INDEX `AutoReplyCooldown_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AutoReplyCooldown_ruleId_fkey`
    FOREIGN KEY (`ruleId`) REFERENCES `AutoReply`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AutoReplyCooldown_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
