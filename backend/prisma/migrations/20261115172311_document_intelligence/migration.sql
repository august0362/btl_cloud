-- AlterTable
ALTER TABLE `users` ADD COLUMN `personalization_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `document_fingerprints` (
    `document_id` CHAR(36) NOT NULL,
    `file_version` INTEGER UNSIGNED NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `algo_version` SMALLINT UNSIGNED NOT NULL,
    `text_status` ENUM('OK', 'PARTIAL', 'SKIPPED') NOT NULL,
    `text_reason` VARCHAR(30) NULL,
    `text_sha256` CHAR(64) NULL,
    `shingle_count` INTEGER UNSIGNED NULL,
    `minhash` VARBINARY(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_document_fingerprints_sha256`(`sha256`),
    INDEX `idx_document_fingerprints_text_sha256`(`text_sha256`),
    INDEX `idx_document_fingerprints_algo_shingles`(`algo_version`, `shingle_count`),
    PRIMARY KEY (`document_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `document_interactions` (
    `user_id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `kind` ENUM('VIEW', 'DOWNLOAD') NOT NULL,
    `first_at` DATETIME(3) NOT NULL,
    `last_at` DATETIME(3) NOT NULL,

    INDEX `idx_document_interactions_document_last`(`document_id`, `last_at`),
    INDEX `idx_document_interactions_last_at`(`last_at`),
    PRIMARY KEY (`user_id`, `document_id`, `kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `document_fingerprints` ADD CONSTRAINT `document_fingerprints_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_interactions` ADD CONSTRAINT `document_interactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_interactions` ADD CONSTRAINT `document_interactions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
