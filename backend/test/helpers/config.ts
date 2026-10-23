import os from 'node:os';
import path from 'node:path';
import { loadConfig, type Config } from '../../src/config/env.js';

/** Giá trị mặc định cho test (ARCHITECTURE §A10.2 cột "Test"); ghi đè bằng biến môi trường TEST_*. */
export const TEST_ENV = {
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://btl:btl_dev_password@localhost:3306/btl_cloud_test',
  S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'btl-cloud-documents-test',
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: 'true',
  AWS_ACCESS_KEY_ID: process.env.TEST_AWS_ACCESS_KEY_ID ?? 'minioadmin',
  AWS_SECRET_ACCESS_KEY: process.env.TEST_AWS_SECRET_ACCESS_KEY ?? 'minioadmin-dev',
};

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    ...TEST_ENV,
    ALLOWED_ORIGINS: 'http://localhost:5173',
    UPLOAD_TMP_DIR: path.join(os.tmpdir(), 'btl-cloud-test-uploads'),
    CLEANUP_WORKER_ENABLED: 'false',
    CLEANUP_GRACE_SECONDS: '0',
    AUTH_RATE_LIMIT_MAX: '1000',
    LOG_LEVEL: 'silent',
    INSTANCE_ID: 'test-instance',
    ...overrides,
  });
}
