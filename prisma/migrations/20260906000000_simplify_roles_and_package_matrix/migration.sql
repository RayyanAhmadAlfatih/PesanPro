-- PesanPro has two account roles: platform SUPERADMIN and subscribing USER.
-- Keep the old enum values temporarily so existing rows can be converted safely.
ALTER TABLE `User`
  MODIFY `role` ENUM('SUPERADMIN', 'OWNER', 'STAFF', 'USER') NOT NULL DEFAULT 'USER';

UPDATE `User`
SET `role` = 'USER', `ownerId` = NULL, `allowStaffApiKeys` = false
WHERE `role` IN ('OWNER', 'STAFF');

ALTER TABLE `User`
  MODIFY `role` ENUM('SUPERADMIN', 'USER') NOT NULL DEFAULT 'USER';

-- Add package limits that are enforced per broadcast and per API minute.
ALTER TABLE `Entitlement`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

ALTER TABLE `TenantEntitlementOverride`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageCounter`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

ALTER TABLE `UsageLedger`
  MODIFY `feature` ENUM(
    'API_ACCESS', 'API_KEYS', 'DEVICES', 'STAFF', 'MESSAGES_MONTHLY',
    'API_REQUESTS_MONTHLY', 'SCHEDULED_MESSAGES', 'BROADCASTS_MONTHLY',
    'BROADCAST_RECIPIENTS_PER_BATCH', 'BROADCAST_MIN_DELAY_MS',
    'CAMPAIGNS_MONTHLY', 'AUTOREPLY_RULES', 'WEBHOOKS',
    'API_REQUESTS_PER_MINUTE', 'MEDIA_STORAGE_BYTES'
  ) NOT NULL;

INSERT INTO `Plan`
  (`id`, `code`, `name`, `description`, `isActive`, `isDefault`, `trialDays`, `priceMonthly`, `currency`, `createdAt`, `updatedAt`)
VALUES
  ('plan_starter', 'STARTER', 'Starter', '1 sesi WhatsApp, maksimal 50 penerima per broadcast, delay minimal 5 detik, FAQ support.', true, false, 0, 75000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('plan_bisnis', 'BISNIS', 'Bisnis', '3 sesi WhatsApp, maksimal 200 penerima per broadcast, delay minimal 3 detik, WhatsApp support.', true, false, 0, 149000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('plan_pro', 'PRO', 'Pro', '10 sesi WhatsApp, maksimal 1.000 penerima per broadcast, delay minimal 2 detik, priority WhatsApp support.', true, false, 0, 299000, 'IDR', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `isActive` = VALUES(`isActive`),
  `isDefault` = VALUES(`isDefault`),
  `trialDays` = VALUES(`trialDays`),
  `priceMonthly` = VALUES(`priceMonthly`),
  `currency` = VALUES(`currency`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- Limits omitted from the requested package table remain enabled and unlimited.
INSERT INTO `Entitlement` (`id`, `planId`, `feature`, `enabled`, `limitValue`, `createdAt`, `updatedAt`)
VALUES
  ('ent_starter_api_access', 'plan_starter', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_keys', 'plan_starter', 'API_KEYS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_devices', 'plan_starter', 'DEVICES', true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_staff', 'plan_starter', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_messages', 'plan_starter', 'MESSAGES_MONTHLY', true, 10000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_requests', 'plan_starter', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_schedules', 'plan_starter', 'SCHEDULED_MESSAGES', true, 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcasts', 'plan_starter', 'BROADCASTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcast_batch', 'plan_starter', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 50, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_broadcast_delay', 'plan_starter', 'BROADCAST_MIN_DELAY_MS', true, 5000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_campaigns', 'plan_starter', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_autoreply', 'plan_starter', 'AUTOREPLY_RULES', true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_webhooks', 'plan_starter', 'WEBHOOKS', true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_api_rpm', 'plan_starter', 'API_REQUESTS_PER_MINUTE', true, 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_starter_media', 'plan_starter', 'MEDIA_STORAGE_BYTES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  ('ent_bisnis_api_access', 'plan_bisnis', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_keys', 'plan_bisnis', 'API_KEYS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_devices', 'plan_bisnis', 'DEVICES', true, 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_staff', 'plan_bisnis', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_messages', 'plan_bisnis', 'MESSAGES_MONTHLY', true, 25000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_requests', 'plan_bisnis', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_schedules', 'plan_bisnis', 'SCHEDULED_MESSAGES', true, 100, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcasts', 'plan_bisnis', 'BROADCASTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcast_batch', 'plan_bisnis', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 200, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_broadcast_delay', 'plan_bisnis', 'BROADCAST_MIN_DELAY_MS', true, 3000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_campaigns', 'plan_bisnis', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_autoreply', 'plan_bisnis', 'AUTOREPLY_RULES', true, 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_webhooks', 'plan_bisnis', 'WEBHOOKS', true, 5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_api_rpm', 'plan_bisnis', 'API_REQUESTS_PER_MINUTE', true, 60, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_bisnis_media', 'plan_bisnis', 'MEDIA_STORAGE_BYTES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  ('ent_pro_api_access', 'plan_pro', 'API_ACCESS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_keys', 'plan_pro', 'API_KEYS', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_devices', 'plan_pro', 'DEVICES', true, 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_staff', 'plan_pro', 'STAFF', false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_messages', 'plan_pro', 'MESSAGES_MONTHLY', true, 100000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_requests', 'plan_pro', 'API_REQUESTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_schedules', 'plan_pro', 'SCHEDULED_MESSAGES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcasts', 'plan_pro', 'BROADCASTS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcast_batch', 'plan_pro', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 1000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_broadcast_delay', 'plan_pro', 'BROADCAST_MIN_DELAY_MS', true, 2000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_campaigns', 'plan_pro', 'CAMPAIGNS_MONTHLY', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_autoreply', 'plan_pro', 'AUTOREPLY_RULES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_webhooks', 'plan_pro', 'WEBHOOKS', true, 15, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_api_rpm', 'plan_pro', 'API_REQUESTS_PER_MINUTE', true, 150, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_pro_media', 'plan_pro', 'MEDIA_STORAGE_BYTES', true, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),

  ('ent_trial_broadcast_batch', 'plan_trial', 'BROADCAST_RECIPIENTS_PER_BATCH', true, 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_trial_broadcast_delay', 'plan_trial', 'BROADCAST_MIN_DELAY_MS', true, 10000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('ent_trial_api_rpm', 'plan_trial', 'API_REQUESTS_PER_MINUTE', true, 15, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `enabled` = VALUES(`enabled`),
  `limitValue` = VALUES(`limitValue`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- Former staff accounts become standalone tenants and receive the default plan.
INSERT INTO `Subscription` (`id`, `userId`, `planId`, `status`, `startsAt`, `trialEndsAt`, `endsAt`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('sub_', LEFT(SHA2(CONCAT(`User`.`id`, ':role-migration'), 256), 24)),
  `User`.`id`,
  `Plan`.`id`,
  IF(`Plan`.`trialDays` > 0, 'TRIAL', 'ACTIVE'),
  CURRENT_TIMESTAMP(3),
  IF(`Plan`.`trialDays` > 0, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL `Plan`.`trialDays` DAY), NULL),
  IF(`Plan`.`trialDays` > 0, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL `Plan`.`trialDays` DAY), NULL),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `User`
JOIN `Plan` ON `Plan`.`isDefault` = true AND `Plan`.`isActive` = true
LEFT JOIN `Subscription` ON `Subscription`.`userId` = `User`.`id`
WHERE `User`.`role` = 'USER' AND `Subscription`.`id` IS NULL;

INSERT INTO `SubscriptionHistory` (`id`, `userId`, `planId`, `status`, `reason`, `startsAt`, `endsAt`, `graceEndsAt`, `createdAt`)
SELECT
  CONCAT('subh_', LEFT(SHA2(CONCAT(`Subscription`.`id`, ':role-migration'), 256), 24)),
  `Subscription`.`userId`,
  `Subscription`.`planId`,
  `Subscription`.`status`,
  'role_simplification',
  `Subscription`.`startsAt`,
  `Subscription`.`endsAt`,
  `Subscription`.`graceEndsAt`,
  CURRENT_TIMESTAMP(3)
FROM `Subscription`
JOIN `User` ON `User`.`id` = `Subscription`.`userId` AND `User`.`role` = 'USER'
LEFT JOIN `SubscriptionHistory` ON `SubscriptionHistory`.`userId` = `Subscription`.`userId`
WHERE `SubscriptionHistory`.`id` IS NULL;
