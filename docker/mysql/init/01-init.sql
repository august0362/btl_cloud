-- Development init script for MySQL 8.4
-- Creates the test database and grants privileges to the btl user.
-- Passwords here are public dev values only — never use in production.

-- Create test database with correct charset and collation
CREATE DATABASE IF NOT EXISTS `btl_cloud_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Grant all privileges to btl user (Prisma needs shadow DB access for migrations)
GRANT ALL PRIVILEGES ON *.* TO 'btl'@'%';
FLUSH PRIVILEGES;

