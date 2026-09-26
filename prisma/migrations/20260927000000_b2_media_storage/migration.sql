ALTER TABLE `PaymentVerification`
  ADD COLUMN `proofStoragePath` VARCHAR(512) NULL,
  ADD COLUMN `proofMimeType` VARCHAR(191) NULL,
  ADD COLUMN `proofSizeBytes` BIGINT NULL,
  ADD COLUMN `proofChecksumSha256` VARCHAR(64) NULL;
