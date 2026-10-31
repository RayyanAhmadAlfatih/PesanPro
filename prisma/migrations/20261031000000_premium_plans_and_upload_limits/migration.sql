-- Premium-only packaging: no free trial, lower entry price, and a per-plan
-- upload ceiling.
--
-- Three things change together because they are one commercial decision:
--   1. New accounts land on an inactive "Belum aktif" plan instead of a trial.
--      They can sign in, pick a package, and pay, but nothing is billable until
--      a payment is approved.
--   2. Starter/Bisnis/Pro are repriced for the SME market. Message, broadcast,
--      auto-reply, webhook, and device ceilings move with the new price.
--   3. Every plan gains MEDIA_MAX_UPLOAD_BYTES so one large file cannot consume
--      a small tenant's storage or upload bandwidth.
--
-- Existing trial subscriptions are moved to the inactive plan rather than left
-- on a retired plan: an inactive plan denies every entitlement, so leaving them
-- there would produce the same lockout with a misleading "Trial" label.

-- 1. New entitlement feature -------------------------------------------------

ALTER TABLE `Entitlement`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES', 'MEDIA_MAX_UPLOAD_BYTES'
  ) NOT NULL;

ALTER TABLE `TenantEntitlementOverride`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES', 'MEDIA_MAX_UPLOAD_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageCounter`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES', 'MEDIA_MAX_UPLOAD_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageLedger`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES', 'MEDIA_MAX_UPLOAD_BYTES'
  ) NOT NULL;

-- 2. Plans -------------------------------------------------------------------

INSERT INTO `Plan`
  (`id`, `code`, `name`, `description`, `isActive`, `isDefault`, `priceMonthly`, `priceYearly`, `currency`, `createdAt`, `updatedAt`)
VALUES
  ('plan_pending', 'PENDING', 'Belum aktif',
   'Akun baru tanpa paket berbayar. Pilih paket dan kirim bukti pembayaran untuk mengaktifkan pengiriman.',
   true, true, NULL, NULL, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('plan_starter', 'STARTER', 'Starter',
   '1 perangkat, 3.000 pesan/bulan, 50 broadcast/bulan, 10 aturan auto-reply, 2 webhook.',
   true, false, 20000, 200000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('plan_bisnis', 'BISNIS', 'Bisnis',
   '3 perangkat, 12.000 pesan/bulan, 200 broadcast/bulan, 50 aturan auto-reply, 5 webhook.',
   true, false, 49000, 490000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('plan_pro', 'PRO', 'Pro',
   '5 perangkat, 40.000 pesan/bulan, 500 broadcast/bulan, auto-reply tanpa batas, 15 webhook.',
   true, false, 99000, 990000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `isActive` = VALUES(`isActive`),
  `priceMonthly` = VALUES(`priceMonthly`),
  `priceYearly` = VALUES(`priceYearly`),
  `currency` = VALUES(`currency`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- Exactly one default plan. The default is only used when a new account is
-- provisioned; it is not a purchasable package and is filtered out of pricing.
UPDATE `Plan` SET `isDefault` = false;
UPDATE `Plan` SET `isDefault` = true WHERE `id` = 'plan_pending';

-- The trial plan is retired. The row stays because subscription history points
-- at it (FK RESTRICT); it is no longer active and cannot be assigned.
UPDATE `Plan`
SET `isActive` = false, `isDefault` = false, `name` = 'Trial (dihentikan)', `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `id` = 'plan_trial';

-- 3. Entitlements ------------------------------------------------------------

-- Replace, do not merge: a limit that disappears from the new matrix must not
-- survive as a stale row that silently grants more than the package sells.
DELETE FROM `Entitlement` WHERE `planId` IN ('plan_pending', 'plan_starter', 'plan_bisnis', 'plan_pro');

INSERT INTO `Entitlement` (`id`, `planId`, `feature`, `enabled`, `limitValue`, `createdAt`, `updatedAt`)
VALUES
  -- Pending: every capability is present but denied, so the dashboard can show
  -- a complete "locked" state instead of an empty entitlement list.
  ('ent_pending_api_access', 'plan_pending', 'API_ACCESS', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_api_keys', 'plan_pending', 'API_KEYS', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_devices', 'plan_pending', 'DEVICES', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_staff', 'plan_pending', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_messages', 'plan_pending', 'MESSAGES_MONTHLY', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_api_requests', 'plan_pending', 'API_REQUESTS_MONTHLY', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_schedules', 'plan_pending', 'SCHEDULED_MESSAGES', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_broadcasts', 'plan_pending', 'BROADCASTS_MONTHLY', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_broadcast_batch', 'plan_pending', 'BROADCAST_RECIPIENTS_PER_BATCH', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_broadcast_delay', 'plan_pending', 'BROADCAST_MIN_DELAY_MS', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_campaigns', 'plan_pending', 'CAMPAIGNS_MONTHLY', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_autoreply', 'plan_pending', 'AUTOREPLY_RULES', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_webhooks', 'plan_pending', 'WEBHOOKS', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_api_rpm', 'plan_pending', 'API_REQUESTS_PER_MINUTE', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_media', 'plan_pending', 'MEDIA_STORAGE_BYTES', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pending_media_upload', 'plan_pending', 'MEDIA_MAX_UPLOAD_BYTES', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  -- Starter: Rp 20.000. One device, 3.000 messages, 50 broadcasts.
  ('ent_starter_api_access', 'plan_starter', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_keys', 'plan_starter', 'API_KEYS', true, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_devices', 'plan_starter', 'DEVICES', true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_staff', 'plan_starter', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_messages', 'plan_starter', 'MESSAGES_MONTHLY', true, 3000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_requests', 'plan_starter', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_schedules', 'plan_starter', 'SCHEDULED_MESSAGES', true, 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcasts', 'plan_starter', 'BROADCASTS_MONTHLY', true, 50, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcast_batch', 'plan_starter', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 500, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcast_delay', 'plan_starter', 'BROADCAST_MIN_DELAY_MS', true, 5000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_campaigns', 'plan_starter', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_autoreply', 'plan_starter', 'AUTOREPLY_RULES', true, 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_webhooks', 'plan_starter', 'WEBHOOKS', true, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_rpm', 'plan_starter', 'API_REQUESTS_PER_MINUTE', true, 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_media', 'plan_starter', 'MEDIA_STORAGE_BYTES', true, 1073741824, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_media_upload', 'plan_starter', 'MEDIA_MAX_UPLOAD_BYTES', true, 52428800, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  -- Bisnis: Rp 49.000. Three devices, 12.000 messages, 200 broadcasts.
  ('ent_bisnis_api_access', 'plan_bisnis', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_keys', 'plan_bisnis', 'API_KEYS', true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_devices', 'plan_bisnis', 'DEVICES', true, 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_staff', 'plan_bisnis', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_messages', 'plan_bisnis', 'MESSAGES_MONTHLY', true, 12000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_requests', 'plan_bisnis', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_schedules', 'plan_bisnis', 'SCHEDULED_MESSAGES', true, 100, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcasts', 'plan_bisnis', 'BROADCASTS_MONTHLY', true, 200, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcast_batch', 'plan_bisnis', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 1500, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcast_delay', 'plan_bisnis', 'BROADCAST_MIN_DELAY_MS', true, 3000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_campaigns', 'plan_bisnis', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_autoreply', 'plan_bisnis', 'AUTOREPLY_RULES', true, 50, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_webhooks', 'plan_bisnis', 'WEBHOOKS', true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_rpm', 'plan_bisnis', 'API_REQUESTS_PER_MINUTE', true, 60, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_media', 'plan_bisnis', 'MEDIA_STORAGE_BYTES', true, 5368709120, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_media_upload', 'plan_bisnis', 'MEDIA_MAX_UPLOAD_BYTES', true, 78643200, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  -- Pro: Rp 99.000. Five devices, 40.000 messages, unlimited auto-reply.
  ('ent_pro_api_access', 'plan_pro', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_keys', 'plan_pro', 'API_KEYS', true, 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_devices', 'plan_pro', 'DEVICES', true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_staff', 'plan_pro', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_messages', 'plan_pro', 'MESSAGES_MONTHLY', true, 40000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_requests', 'plan_pro', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_schedules', 'plan_pro', 'SCHEDULED_MESSAGES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcasts', 'plan_pro', 'BROADCASTS_MONTHLY', true, 500, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcast_batch', 'plan_pro', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 3000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcast_delay', 'plan_pro', 'BROADCAST_MIN_DELAY_MS', true, 2000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_campaigns', 'plan_pro', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_autoreply', 'plan_pro', 'AUTOREPLY_RULES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_webhooks', 'plan_pro', 'WEBHOOKS', true, 15, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_rpm', 'plan_pro', 'API_REQUESTS_PER_MINUTE', true, 150, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_media', 'plan_pro', 'MEDIA_STORAGE_BYTES', true, 21474836480, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_media_upload', 'plan_pro', 'MEDIA_MAX_UPLOAD_BYTES', true, 104857600, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- 4. Existing trials ---------------------------------------------------------

INSERT INTO `SubscriptionHistory` (`id`, `userId`, `planId`, `status`, `reason`, `startsAt`, `endsAt`, `graceEndsAt`)
SELECT
  CONCAT('subh_', LEFT(SHA2(CONCAT(`id`, '-trial-retired'), 256), 24)),
  `userId`,
  'plan_pending',
  'ACTIVE',
  'trial_retired_2026_10_31',
  CURRENT_TIMESTAMP(3),
  NULL,
  NULL
FROM `Subscription`
WHERE `planId` = 'plan_trial' OR `status` = 'TRIAL';

UPDATE `Subscription`
SET `planId` = 'plan_pending',
    `status` = 'ACTIVE',
    `trialEndsAt` = NULL,
    `endsAt` = NULL,
    `graceEndsAt` = NULL,
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `planId` = 'plan_trial' OR `status` = 'TRIAL';

-- 5. Remove the trial length column -----------------------------------------

-- A subscription row must never become a trial by omission. TRIAL stays in the
-- enum so historical rows remain readable, but new rows default to ACTIVE.
ALTER TABLE `Subscription`
  MODIFY `status` ENUM('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE `Plan` DROP COLUMN `trialDays`;
