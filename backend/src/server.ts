import { mkdir } from 'node:fs/promises';
import { createApp } from './app.js';
import { sweepTmpDir } from './cleanup/tmp-sweeper.js';
import { ConfigError, loadConfig, type Config } from './config/env.js';
import { createServices } from './container.js';
import { createPrismaClient } from './db/prisma.js';
import { createShutdown } from './lifecycle.js';
import { createLogger } from './lib/logger.js';
import { S3ObjectStorage } from './storage/s3-object-storage.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;

function readConfig(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const logger = createLogger({ level: config.logLevel, instanceId: config.instanceId });
  await mkdir(config.upload.tmpDir, { recursive: true });

  const prisma = createPrismaClient(config.databaseUrl);
  // Mở kết nối ngay: lần truy vấn đầu tiên phải khởi động engine + kết nối, có thể vượt timeout 2 s của
  // readiness (API-02). DB chưa sẵn sàng thì không chặn khởi động — liveness vẫn trả 200 (D-14).
  try {
    await prisma.$connect();
  } catch (error) {
    logger.warn({ err: error, event: 'db.connect_deferred' }, 'Chưa kết nối được DB lúc khởi động; sẽ thử lại khi có request');
  }
  const storage = new S3ObjectStorage(config.s3);
  const services = createServices({ config, logger, prisma, storage });
  await sweepTmpDir(config.upload.tmpDir, Number.NEGATIVE_INFINITY);
  try {
    while (await services.sessions.deleteExpired(services.clock.now(), 1000) === 1000) { /* next batch */ }
  } catch (error) {
    logger.warn({ err: error, event: 'sessions.startup_cleanup_failed' }, 'Chưa xoá được phiên hết hạn');
  }
  const app = createApp({ config, logger, prisma, storage, services });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, version: config.version, event: 'server.started' }, 'Backend đã khởi động');
  });
  // §A10.4: upload 50 MB qua mạng chậm; keep-alive lớn hơn ALB idle timeout (120 s).
  server.requestTimeout = 900_000;
  server.keepAliveTimeout = 125_000;
  server.headersTimeout = 126_000;

  const shutdown = createShutdown({
    logger,
    closeServer: () => new Promise<void>((resolve) => server.close(() => resolve())),
    disconnectDatabase: () => prisma.$disconnect(),
    destroyStorage: () => storage.destroy(),
    exit: (code) => process.exit(code),
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
  });
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Không khởi động được backend:', error);
  process.exit(1);
});
