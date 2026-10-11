-- Track the welcome message on the contact so it is sent at most once.
--
-- The previous check counted stored messages and fired when the count was 1.
-- Once message retention began purging rows, a contact returning after the
-- retention window looked brand new and received the welcome a second time.
-- The contact row has no retention, so the marker belongs here.

ALTER TABLE `Contact` ADD COLUMN `welcomedAt` DATETIME(3) NULL;

-- Backfill. Every existing contact that has already exchanged at least one
-- message is treated as welcomed, so this deploy does not send a second
-- welcome to contacts who received one under the old logic. Without the
-- backfill they would all receive it once more.
--
-- The join is on (sessionId, remoteJid) rather than contactId, because that
-- is exactly the key the old welcome check counted on. Message carries an
-- index on (sessionId, remoteJid, timestamp), so the subquery is covered.
UPDATE `Contact` AS `c`
SET `welcomedAt` = (
    SELECT MIN(`m`.`timestamp`)
    FROM `Message` AS `m`
    WHERE `m`.`sessionId` = `c`.`sessionId`
      AND `m`.`remoteJid` = `c`.`jid`
)
WHERE `c`.`welcomedAt` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `Message` AS `m`
    WHERE `m`.`sessionId` = `c`.`sessionId`
      AND `m`.`remoteJid` = `c`.`jid`
  );
