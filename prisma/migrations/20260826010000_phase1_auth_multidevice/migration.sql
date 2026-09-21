-- Phase 1: authentication, tenant membership, explicit device lifecycle, and runtime lease.

ALTER TABLE `User`
  ADD COLUMN `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `ownerId` VARCHAR(191) NULL,
  ADD COLUMN `deviceLimit` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `staffLimit` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `User_ownerId_role_idx` ON `User`(`ownerId`, `role`);
CREATE INDEX `User_status_idx` ON `User`(`status`);
ALTER TABLE `User`
  ADD CONSTRAINT `User_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE `Session` SET `status` = 'FAILED' WHERE `status` = 'ZOMBIE';
UPDATE `Session` SET `status` = 'QR_REQUIRED' WHERE `status` = 'SCAN_QR';
UPDATE `Session` SET `status` = 'STOPPED'
WHERE `status` NOT IN (
  'CONNECTING', 'QR_REQUIRED', 'PAIRING_REQUIRED', 'CONNECTED',
  'RECONNECTING', 'DISCONNECTED', 'STOPPED', 'LOGGED_OUT', 'FAILED'
);

ALTER TABLE `Session`
  MODIFY COLUMN `status` ENUM(
    'CONNECTING', 'QR_REQUIRED', 'PAIRING_REQUIRED', 'CONNECTED',
    'RECONNECTING', 'DISCONNECTED', 'STOPPED', 'LOGGED_OUT', 'FAILED'
  ) NOT NULL DEFAULT 'STOPPED';

CREATE TABLE `PasswordResetToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
  INDEX `PasswordResetToken_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PasswordResetToken_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SessionRuntimeLock` (
  `sessionId` VARCHAR(191) NOT NULL,
  `workerId` VARCHAR(191) NOT NULL,
  `acquiredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `heartbeatAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  INDEX `SessionRuntimeLock_expiresAt_idx`(`expiresAt`),
  INDEX `SessionRuntimeLock_workerId_idx`(`workerId`),
  PRIMARY KEY (`sessionId`),
  CONSTRAINT `SessionRuntimeLock_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
