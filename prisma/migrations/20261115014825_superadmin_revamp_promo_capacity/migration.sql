-- Revamp SuperAdmin 15 Nov 2026:
--   * promo persen / harga tetap / voucher (hanya pembelian pertama)
--   * riwayat perubahan harga Plan
--   * harga normal terkunci per langganan untuk perpanjangan
--   * biaya VPS dan batas kapasitas yang bisa diedit admin
--
-- Catatan: migrasi ini sengaja TIDAK memuat drift lama yang dihasilkan
-- `prisma migrate dev` di Windows (kolom Segment.createKey/requestHash,
-- index PaymentAccount_id_key, dan default updatedAt). Drift itu sudah ada
-- sebelum perubahan ini dan tidak boleh ikut terhapus di produksi.

-- ---------------------------------------------------------------------------
-- 1. Snapshot harga pada bukti pembayaran
-- ---------------------------------------------------------------------------
ALTER TABLE `PaymentVerification`
  ADD COLUMN `baseAmount` DECIMAL(18, 2) NULL,
  ADD COLUMN `discountAmount` DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `listMonthlyPrice` DECIMAL(18, 2) NULL,
  ADD COLUMN `listYearlyPrice` DECIMAL(18, 2) NULL,
  ADD COLUMN `promoId` VARCHAR(191) NULL,
  ADD COLUMN `voucherCode` VARCHAR(64) NULL;

-- Baris lama: harga normal dianggap sama dengan nominal yang dibayar.
UPDATE `PaymentVerification`
SET `baseAmount` = `amount`
WHERE `baseAmount` IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Harga normal terkunci per langganan
-- ---------------------------------------------------------------------------
ALTER TABLE `Subscription`
  ADD COLUMN `lockedMonthlyPrice` DECIMAL(18, 2) NULL,
  ADD COLUMN `lockedYearlyPrice` DECIMAL(18, 2) NULL;

-- Langganan yang sudah ada mengunci harga Plan saat migrasi supaya edit harga
-- berikutnya hanya berlaku untuk tenant baru.
UPDATE `Subscription` s
JOIN `Plan` p ON p.`id` = s.`planId`
SET s.`lockedMonthlyPrice` = p.`priceMonthly`,
    s.`lockedYearlyPrice` = p.`priceYearly`
WHERE s.`lockedMonthlyPrice` IS NULL
  AND s.`lockedYearlyPrice` IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Biaya VPS dan batas kapasitas
-- ---------------------------------------------------------------------------
ALTER TABLE `SystemConfig`
  ADD COLUMN `capacityLimits` JSON NULL,
  ADD COLUMN `vpsMonthlyCostIdr` DECIMAL(18, 2) NOT NULL DEFAULT 90000;

-- Jenis email baru untuk peringatan kapasitas VPS.
ALTER TABLE `EmailOutbox`
  MODIFY COLUMN `type` ENUM('PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'CAPACITY_ALERT') NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Promo, paket promo, dan pemakaian promo
-- ---------------------------------------------------------------------------
CREATE TABLE `Promo` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `kind` ENUM('PERCENT', 'FIXED', 'VOUCHER') NOT NULL,
    `percent` DECIMAL(5, 2) NULL,
    `code` VARCHAR(64) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `usageLimitTotal` INTEGER NULL,
    `usageLimitPerUser` INTEGER NULL,
    `billingScope` ENUM('MONTHLY', 'YEARLY', 'BOTH') NOT NULL DEFAULT 'BOTH',
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Promo_code_key`(`code`),
    INDEX `Promo_enabled_startsAt_endsAt_idx`(`enabled`, `startsAt`, `endsAt`),
    INDEX `Promo_kind_enabled_idx`(`kind`, `enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PromoPlan` (
    `id` VARCHAR(191) NOT NULL,
    `promoId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `fixedPrice` DECIMAL(18, 2) NULL,

    INDEX `PromoPlan_planId_idx`(`planId`),
    UNIQUE INDEX `PromoPlan_promoId_planId_key`(`promoId`, `planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PromoRedemption` (
    `id` VARCHAR(191) NOT NULL,
    `promoId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `paymentVerificationId` VARCHAR(191) NULL,
    `billingCycle` ENUM('MONTHLY', 'YEARLY') NOT NULL,
    `baseAmount` DECIMAL(18, 2) NOT NULL,
    `discountAmount` DECIMAL(18, 2) NOT NULL,
    `chargedAmount` DECIMAL(18, 2) NOT NULL,
    `status` ENUM('RESERVED', 'APPROVED', 'RELEASED') NOT NULL DEFAULT 'RESERVED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PromoRedemption_paymentVerificationId_key`(`paymentVerificationId`),
    INDEX `PromoRedemption_promoId_userId_status_idx`(`promoId`, `userId`, `status`),
    INDEX `PromoRedemption_promoId_status_createdAt_idx`(`promoId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Riwayat perubahan harga Plan
-- ---------------------------------------------------------------------------
CREATE TABLE `PlanPriceHistory` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `field` ENUM('MONTHLY', 'YEARLY') NOT NULL,
    `oldPrice` DECIMAL(18, 2) NULL,
    `newPrice` DECIMAL(18, 2) NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'IDR',
    `changedById` VARCHAR(191) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlanPriceHistory_planId_changedAt_idx`(`planId`, `changedAt`),
    INDEX `PlanPriceHistory_changedById_changedAt_idx`(`changedById`, `changedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Index dan foreign key
-- ---------------------------------------------------------------------------
CREATE INDEX `PaymentVerification_promoId_createdAt_idx`
  ON `PaymentVerification`(`promoId`, `createdAt`);

ALTER TABLE `PaymentVerification`
  ADD CONSTRAINT `PaymentVerification_promoId_fkey`
  FOREIGN KEY (`promoId`) REFERENCES `Promo`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Promo`
  ADD CONSTRAINT `Promo_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PromoPlan`
  ADD CONSTRAINT `PromoPlan_promoId_fkey`
  FOREIGN KEY (`promoId`) REFERENCES `Promo`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PromoPlan`
  ADD CONSTRAINT `PromoPlan_planId_fkey`
  FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PromoRedemption`
  ADD CONSTRAINT `PromoRedemption_promoId_fkey`
  FOREIGN KEY (`promoId`) REFERENCES `Promo`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PromoRedemption`
  ADD CONSTRAINT `PromoRedemption_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PromoRedemption`
  ADD CONSTRAINT `PromoRedemption_paymentVerificationId_fkey`
  FOREIGN KEY (`paymentVerificationId`) REFERENCES `PaymentVerification`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PlanPriceHistory`
  ADD CONSTRAINT `PlanPriceHistory_planId_fkey`
  FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PlanPriceHistory`
  ADD CONSTRAINT `PlanPriceHistory_changedById_fkey`
  FOREIGN KEY (`changedById`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
