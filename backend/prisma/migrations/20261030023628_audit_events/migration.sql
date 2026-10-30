-- CreateTable
CREATE TABLE `audit_events` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL,
    `actor_type` ENUM('USER', 'DEVELOPER', 'ANONYMOUS') NOT NULL,
    `actor_id` VARCHAR(64) NULL,
    `action` VARCHAR(40) NOT NULL,
    `target_type` ENUM('USER', 'DOCUMENT', 'FRIENDSHIP') NULL,
    `target_id` CHAR(36) NULL,
    `outcome` ENUM('SUCCESS', 'FAILURE') NOT NULL,
    `error_code` VARCHAR(40) NULL,
    `request_id` CHAR(36) NULL,
    `metadata` JSON NULL,

    INDEX `idx_audit_events_created_at`(`created_at`),
    INDEX `idx_audit_events_actor_created`(`actor_id`, `created_at`),
    INDEX `idx_audit_events_target_created`(`target_id`, `created_at`),
    INDEX `idx_audit_events_request_id`(`request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
