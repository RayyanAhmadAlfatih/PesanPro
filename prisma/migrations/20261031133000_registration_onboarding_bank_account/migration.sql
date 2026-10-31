-- Payment destination for registration onboarding.
--
-- New accounts choose a plan and upload the transfer proof while registering,
-- so the bank account has to be available before the account exists. Empty
-- defaults keep existing installations valid; the registration endpoint refuses
-- new signups until an operator fills these in.

ALTER TABLE `SystemConfig`
  ADD COLUMN `bankName` VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN `bankAccountNumber` VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN `bankAccountHolder` VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN `paymentNote` TEXT NULL;
