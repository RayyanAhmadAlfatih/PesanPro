-- Widen AuthState.encValue from TEXT (64KB) to LONGTEXT.
--
-- Observed on the production VPS (2026-10-17): a long-lived WhatsApp session
-- failed to persist its auth state with MySQL error 1406 ("Data too long for
-- column 'encValue'"). Baileys accumulates credentials inside creds-me (e.g.
-- processedHistoryMessages), so the encrypted + base64 blob grows over the
-- lifetime of a session and can cross the TEXT limit. The failure is caught
-- and logged (not thrown), so the session keeps running on stale state until
-- the next restart forces a QR re-scan.
--
-- This migration matches the schema change (`@db.LongText`).

ALTER TABLE `AuthState` MODIFY COLUMN `encValue` LONGTEXT NULL;
