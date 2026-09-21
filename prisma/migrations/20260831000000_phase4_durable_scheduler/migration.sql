-- Phase 4: timezone-aware durable schedules and idempotent occurrence executions.

ALTER TABLE `ScheduledMessage`
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `mediaId` VARCHAR(191) NULL,
  MODIFY COLUMN `mediaUrl` TEXT NULL,
  ADD COLUMN `startAt` DATETIME(3) NULL,
  ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Jakarta',
  ADD COLUMN `kind` ENUM('ONE_TIME', 'RECURRING') NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN `missedRunPolicy` ENUM('SEND_LATE', 'SKIP', 'CANCEL') NOT NULL DEFAULT 'SEND_LATE',
  ADD COLUMN `misfireGraceSeconds` INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `lockedBy` VARCHAR(191) NULL,
  ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `heartbeatAt` DATETIME(3) NULL,
  ADD COLUMN `lastRunAt` DATETIME(3) NULL,
  ADD COLUMN `completedAt` DATETIME(3) NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL,
  ADD COLUMN `safeErrorCode` VARCHAR(191) NULL,
  ADD COLUMN `safeErrorMessage` TEXT NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `ScheduledMessage`
SET
  `startAt` = `sendAt`,
  `kind` = IF(`cronExpression` IS NULL OR `cronExpression` = '', 'ONE_TIME', 'RECURRING'),
  `status` = CASE
    WHEN `status` = 'PENDING' THEN 'ACTIVE'
    WHEN `status` = 'SENT' THEN 'COMPLETED'
    WHEN `status` = 'FAILED' THEN 'FAILED'
    ELSE 'FAILED'
  END;

UPDATE `ScheduledMessage`
SET
  `status` = 'FAILED',
  `safeErrorCode` = 'LEGACY_MEDIA_REQUIRES_REUPLOAD',
  `safeErrorMessage` = 'Legacy media URL must be uploaded to private media before rescheduling'
WHERE `mediaUrl` IS NOT NULL AND `mediaUrl` <> '' AND `mediaId` IS NULL AND `status` = 'ACTIVE';

ALTER TABLE `ScheduledMessage`
  MODIFY COLUMN `startAt` DATETIME(3) NOT NULL,
  MODIFY COLUMN `status` ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX `ScheduledMessage_status_sendAt_idx` ON `ScheduledMessage`(`status`, `sendAt`);
CREATE INDEX `ScheduledMessage_status_leaseExpiresAt_idx` ON `ScheduledMessage`(`status`, `leaseExpiresAt`);
CREATE INDEX `ScheduledMessage_sessionId_status_sendAt_idx` ON `ScheduledMessage`(`sessionId`, `status`, `sendAt`);
CREATE INDEX `ScheduledMessage_createdById_createdAt_idx` ON `ScheduledMessage`(`createdById`, `createdAt`);

ALTER TABLE `ScheduledMessage`
  ADD CONSTRAINT `ScheduledMessage_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `ScheduledMessage_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `PrivateMedia`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ScheduleExecution` (
  `id` VARCHAR(191) NOT NULL,
  `scheduleId` VARCHAR(191) NOT NULL,
  `messageJobId` VARCHAR(191) NULL,
  `occurrenceKey` VARCHAR(191) NOT NULL,
  `scheduledFor` DATETIME(3) NOT NULL,
  `status` ENUM('CLAIMED', 'ENQUEUED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'CLAIMED',
  `attempt` INTEGER NOT NULL DEFAULT 1,
  `workerId` VARCHAR(191) NOT NULL,
  `claimToken` VARCHAR(191) NOT NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `enqueuedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ScheduleExecution_messageJobId_key`(`messageJobId`),
  UNIQUE INDEX `ScheduleExecution_scheduleId_occurrenceKey_key`(`scheduleId`, `occurrenceKey`),
  INDEX `ScheduleExecution_status_startedAt_idx`(`status`, `startedAt`),
  INDEX `ScheduleExecution_scheduleId_scheduledFor_idx`(`scheduleId`, `scheduledFor`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ScheduleExecution_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ScheduledMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ScheduleExecution_messageJobId_fkey` FOREIGN KEY (`messageJobId`) REFERENCES `MessageJob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
