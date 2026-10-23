import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { S3ObjectStorage } from '../../src/storage/s3-object-storage.js';
import { TEST_ENV } from '../helpers/config.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Chuẩn bị hạ tầng test (§A4.6, §A10.6): kiểm tra MySQL + S3 sẵn sàng, `prisma migrate reset`
 * trên DB test (áp dụng đúng migration commit trong repo), tạo bucket test nếu chưa có.
 */
export default async function setup(): Promise<void> {
  // Chốt an toàn: lệnh reset phá huỷ dữ liệu → chỉ cho phép trên DB có tên kết thúc bằng "_test".
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

  const reset = spawnSync('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (reset.status !== 0) throw new Error(`prisma migrate reset thất bại:\n${reset.stdout}\n${reset.stderr}`);

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
