import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { S3ObjectStorage } from '../../src/storage/s3-object-storage.js';
import { TEST_ENV } from '../helpers/config.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Áp migration đã commit lên DB test và tạo bucket test nếu thiếu.
 * Các fixture tự dọn dữ liệu; không reset schema hay lịch sử migration.
 */
export default async function setup(): Promise<void> {
  // Các fixture xoá dữ liệu giữa test, nên chỉ cho phép DB dành riêng cho kiểm thử.
  const databaseName = new URL(TEST_ENV.DATABASE_URL).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Từ chối chạy integration test: DB "${databaseName}" không phải DB test (tên phải kết thúc bằng "_test").`);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_ENV.DATABASE_URL } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      `Không kết nối được MySQL test tại ${TEST_ENV.DATABASE_URL}. Chạy "docker compose up -d" (hoặc đặt TEST_DATABASE_URL). ${String(error)}`,
      { cause: error },
    );
  } finally {
    await prisma.$disconnect();
  }

  const migration = spawnSync(process.execPath, [path.join(backendDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
    encoding: 'utf8',
  });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw new Error(`prisma migrate deploy thất bại:\n${migration.stdout}\n${migration.stderr}`);

  process.env.AWS_ACCESS_KEY_ID = TEST_ENV.AWS_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = TEST_ENV.AWS_SECRET_ACCESS_KEY;
  const storage = new S3ObjectStorage({
    bucket: TEST_ENV.S3_BUCKET,
    region: TEST_ENV.S3_REGION,
    endpoint: TEST_ENV.S3_ENDPOINT,
    forcePathStyle: true,
  });
  try {
    await storage.ensureBucket();
  } catch (error) {
    throw new Error(`Không kết nối được object storage test tại ${TEST_ENV.S3_ENDPOINT}: ${String(error)}`, { cause: error });
  } finally {
    storage.destroy();
  }
}
