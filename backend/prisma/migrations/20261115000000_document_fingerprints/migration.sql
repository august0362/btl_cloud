-- Fingerprints are small metadata; original files remain in object storage.
CREATE TABLE `document_fingerprints` (
  `document_id` CHAR(36) NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `text_hash` CHAR(64) NULL,
  `signature` VARCHAR(512) NULL,
  PRIMARY KEY (`document_id`),
  INDEX `idx_document_fingerprints_sha256` (`sha256`),
  INDEX `idx_document_fingerprints_text_hash` (`text_hash`),
  CONSTRAINT `fk_document_fingerprints_document`
    FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
