ALTER TABLE `User`
    ADD COLUMN `apiKeyPreview` VARCHAR(191) NULL,
    ADD COLUMN `apiKeyCreatedAt` DATETIME(3) NULL;

UPDATE `User`
SET
    `apiKeyPreview` = CASE
        WHEN `apiKey` IS NULL THEN NULL
        ELSE CONCAT(LEFT(`apiKey`, 8), '...', RIGHT(`apiKey`, 4))
    END,
    `apiKey` = CASE
        WHEN `apiKey` IS NULL THEN NULL
        ELSE SHA2(`apiKey`, 256)
    END,
    `apiKeyCreatedAt` = CASE
        WHEN `apiKey` IS NULL THEN `apiKeyCreatedAt`
        ELSE COALESCE(`apiKeyCreatedAt`, CURRENT_TIMESTAMP(3))
    END
WHERE `apiKey` IS NOT NULL;
