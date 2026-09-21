-- PesanPro no longer checks the upstream repository for release notifications.
-- Remove notifications created by the retired automatic update checker so they
-- cannot keep appearing after the checker itself has been removed.
DELETE FROM `Notification`
WHERE `type` = 'SYSTEM'
  AND `title` LIKE 'New Update Available:%';
