-- In-app "what's new" popup: admin-authored content shown once inside the
-- dashboard. Separate from Notification, which lands in the bell list and does
-- not interrupt. The popup is deliberately gated so it cannot become a banner
-- every deploy: only PUBLISHED rows with a publishedAt reach users.
CREATE TABLE `Announcement` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `version` VARCHAR(191) NULL,
  `href` VARCHAR(191) NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `source` ENUM('MANUAL', 'AUTO') NOT NULL DEFAULT 'MANUAL',
  `createdById` VARCHAR(191) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Announcement_status_publishedAt_idx`(`status`, `publishedAt`),
  INDEX `Announcement_createdById_createdAt_idx`(`createdById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Dismissal watermark. It stores the publishedAt of the last announcement the
-- user closed, so the popup appears once per publish rather than once per
-- device. No backfill: NULL means "has never dismissed anything", which is the
-- correct starting state for every existing account.
ALTER TABLE `User` ADD COLUMN `lastSeenAnnouncementAt` DATETIME(3) NULL;

ALTER TABLE `Announcement` ADD CONSTRAINT `Announcement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
