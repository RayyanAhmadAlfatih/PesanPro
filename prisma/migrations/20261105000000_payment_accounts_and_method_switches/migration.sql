-- Fase 1 pembayaran: nomor WhatsApp kontak user, rekening multi-bank,
-- dan saklar utama cara bayar (Manual / Midtrans).
--
-- Prinsip data:
--   1. Rekening BCA yang sudah terisi di SystemConfig JANGAN diubah atau
--      dihapus — disalin menjadi satu entri PaymentAccount aktif + default.
--   2. Kolom bank* lama di SystemConfig dipertahankan apa adanya (legacy)
--      supaya revert kode tanpa rollback migrasi tetap membaca data sama.
--   3. Semua PaymentVerification lama dibackfill ke rekening hasil salinan
--      karena saat itu hanya ada satu rekening.

-- ---------------------------------------------------------------------------
-- 1. Tabel rekening tujuan transfer manual
-- ---------------------------------------------------------------------------
CREATE TABLE `PaymentAccount` (
    `id` VARCHAR(191) NOT NULL,
    `bankName` VARCHAR(120) NOT NULL,
    `accountNumber` VARCHAR(60) NOT NULL,
    `accountHolder` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentAccount_id_key`(`id`),
    INDEX `PaymentAccount_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Kolom baru: nomor WA user, rekening pilihan pembayar, saklar cara bayar
-- ---------------------------------------------------------------------------
ALTER TABLE `User`
  ADD COLUMN `whatsappNumber` VARCHAR(20) NULL;

ALTER TABLE `PaymentVerification`
  ADD COLUMN `bankAccountId` VARCHAR(191) NULL,
  ADD INDEX `PaymentVerification_bankAccountId_idx`(`bankAccountId`);

ALTER TABLE `PaymentVerification`
  ADD CONSTRAINT `PaymentVerification_bankAccountId_fkey`
  FOREIGN KEY (`bankAccountId`) REFERENCES `PaymentAccount`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SystemConfig`
  ADD COLUMN `manualTransferEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `midtransEnabled` BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. Migrasi data: rekening tunggal SystemConfig -> satu PaymentAccount aktif
--    (dipakai bersama pembayaran lama sehingga statusnya default)
--    Nama kolom mengikuti SystemConfig asli: bankAccountNumber/bankAccountHolder.
-- ---------------------------------------------------------------------------
INSERT INTO `PaymentAccount` (`id`, `bankName`, `accountNumber`, `accountHolder`, `isActive`, `isDefault`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT UUID(), `bankName`, `bankAccountNumber`, `bankAccountHolder`, 1, 1, 0, NOW(3), NOW(3)
FROM `SystemConfig`
WHERE `id` = 'default'
  AND `bankName` <> ''
  AND `bankAccountNumber` <> ''
  AND `bankAccountHolder` <> '';

-- ---------------------------------------------------------------------------
-- 4. Backfill: pembayaran lama ditautkan ke rekening hasil salinan.
--    Aman karena sampai titik ini maksimal ada satu baris PaymentAccount.
-- ---------------------------------------------------------------------------
UPDATE `PaymentVerification` pv
JOIN `PaymentAccount` pa ON pa.`isDefault` = 1
SET pv.`bankAccountId` = pa.`id`
WHERE pv.`bankAccountId` IS NULL;
