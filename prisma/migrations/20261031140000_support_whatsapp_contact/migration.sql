-- WhatsApp support contact shown on the dashboard Help page.
--
-- The number is optional: an empty value means the operator has not set a
-- support channel, and the Help page says so instead of showing a dead button.

ALTER TABLE `SystemConfig`
  ADD COLUMN `supportWhatsapp` VARCHAR(40) NOT NULL DEFAULT '';
