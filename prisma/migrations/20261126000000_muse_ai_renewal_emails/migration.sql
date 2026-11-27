-- Jenis email baru untuk perpanjangan paket: konfirmasi bukti pembayaran ke
-- user, pengingat H-3/H-1 ke user, dan pengingat H-1 ke admin saat perpanjangan
-- sudah dikirim tetapi belum disetujui.
--
-- Hanya menambah nilai enum. Urutan nilai lama dipertahankan supaya baris
-- EmailOutbox yang sudah ada tetap menunjuk jenis yang sama.
ALTER TABLE `EmailOutbox`
  MODIFY COLUMN `type` ENUM(
    'PAYMENT_SUBMITTED',
    'PAYMENT_APPROVED',
    'CAPACITY_ALERT',
    'PAYMENT_SUBMITTED_USER',
    'SUBSCRIPTION_REMINDER',
    'SUBSCRIPTION_REMINDER_ADMIN'
  ) NOT NULL;
