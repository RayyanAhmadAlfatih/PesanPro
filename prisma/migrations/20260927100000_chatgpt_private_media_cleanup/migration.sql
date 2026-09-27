CREATE TABLE `PrivateMediaCleanup` (
  `id` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `uploaderId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `storagePath` VARCHAR(512) NOT NULL,
  `storedName` VARCHAR(191) NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `storageDeletedAt` DATETIME(3) NULL,
  `quotaReleasedAt` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `safeErrorCode` VARCHAR(191) NULL,
  `safeErrorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PrivateMediaCleanup_mediaId_key`(`mediaId`),
  INDEX `PrivateMediaCleanup_status_availableAt_idx`(`status`, `availableAt`),
  INDEX `PrivateMediaCleanup_completedAt_idx`(`completedAt`),
  INDEX `PrivateMediaCleanup_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Deliberately no foreign keys: this tombstone must survive deletion of the
-- original media/user rows long enough to finish object cleanup safely.
