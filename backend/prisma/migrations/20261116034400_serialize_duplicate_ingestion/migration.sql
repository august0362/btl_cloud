CREATE TABLE `document_ingestion_locks` (
    `id` TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

INSERT INTO `document_ingestion_locks` (`id`) VALUES (1);
