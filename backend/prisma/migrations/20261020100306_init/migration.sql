-- BTL Cloud: Initial database migration
-- Creates all 4 tables matching ARCHITECTURE §A4.3
-- Database: MySQL 8.4, charset utf8mb4, collation utf8mb4_0900_ai_ci

-- CreateTable: users — identity and login credentials
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_users_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable: sessions — opaque DB-backed sessions shared across instances
CREATE TABLE `sessions` (
    `id` CHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `idx_sessions_user_id`(`user_id`),
    INDEX `idx_sessions_expires_at`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable: documents — metadata and pointer to current object
CREATE TABLE `documents` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` VARCHAR(2000) NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL,
    `file_type` ENUM('PDF', 'DOCX', 'PPTX') NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `original_filename` VARCHAR(255) NOT NULL,
    `size_bytes` INTEGER UNSIGNED NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `file_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `file_updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uq_documents_storage_key`(`storage_key`),
    INDEX `idx_documents_visibility_created`(`visibility`, `created_at`),
    INDEX `idx_documents_owner_created`(`owner_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable: storage_cleanup_tasks — queue of objects to delete (D-07)
-- No FK to documents — tasks must survive document deletion.
CREATE TABLE `storage_cleanup_tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `storage_key` VARCHAR(512) NOT NULL,
    `reason` ENUM('UPLOAD_GUARD', 'REPLACED', 'DELETED') NOT NULL,
    `document_id` CHAR(36) NULL,
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL,
    `last_error` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_cleanup_storage_key`(`storage_key`),
    INDEX `idx_cleanup_next_attempt`(`next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey: sessions.user_id → users.id ON DELETE CASCADE
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: documents.owner_id → users.id ON DELETE RESTRICT
ALTER TABLE `documents` ADD CONSTRAINT `documents_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

