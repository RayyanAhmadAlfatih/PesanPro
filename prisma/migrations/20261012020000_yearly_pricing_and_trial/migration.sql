-- Yearly pricing and the one week free trial.
--
-- Yearly rates are now stored per plan instead of being derived as
-- monthly x 12. The marketing page derived them that way, so it advertised
-- Rp 900.000 for Starter while the decided yearly price is Rp 750.000: a
-- number nobody could actually be charged.
--
-- The billing cycle is recorded on the payment submission (what was paid for)
-- and on the subscription (what is currently active), because one approved
-- payment now buys either one month or twelve.
--
-- No backfill is needed for existing rows: they were all sold as monthly, and
-- MONTHLY is the column default.

ALTER TABLE `Plan` ADD COLUMN `priceYearly` DECIMAL(18, 2) NULL;

ALTER TABLE `Subscription`
  ADD COLUMN `billingCycle` ENUM('MONTHLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE `PaymentVerification`
  ADD COLUMN `billingCycle` ENUM('MONTHLY', 'YEARLY') NOT NULL DEFAULT 'MONTHLY';

-- Decided yearly rates. Deliberately not monthly x 12: paying yearly is about
-- two months cheaper, which is the point of the option.
UPDATE `Plan` SET `priceYearly` = 750000, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = 'plan_starter';
UPDATE `Plan` SET `priceYearly` = 1490000, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = 'plan_bisnis';
UPDATE `Plan` SET `priceYearly` = 2990000, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = 'plan_pro';

-- The free trial is one week. The trial plan granted fourteen days.
UPDATE `Plan` SET `trialDays` = 7, `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `id` = 'plan_trial';
