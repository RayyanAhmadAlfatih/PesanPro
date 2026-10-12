-- Email OTP login challenges.
--
-- Only the HMAC of the code is stored. A six digit code has a million
-- possibilities, so a plain SHA-256 hash would be brute-forced offline in
-- seconds; an HMAC also requires the server secret, which never leaves the
-- environment.
--
-- No backfill: this is a new table, and an absent challenge simply means the
-- user has not requested a code yet.
CREATE TABLE `OtpChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `OtpChallenge_userId_idx`(`userId`),
  INDEX `OtpChallenge_email_createdAt_idx`(`email`, `createdAt`),
  -- The daily maintenance purge deletes by expiresAt, which tracks createdAt.
  INDEX `OtpChallenge_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OtpChallenge` ADD CONSTRAINT `OtpChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
