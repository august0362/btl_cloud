-- AlterTable
ALTER TABLE `users` ADD COLUMN `last_active_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `idx_users_last_active_at` ON `users`(`last_active_at`);
