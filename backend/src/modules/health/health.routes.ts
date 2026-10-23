import { Router } from 'express';
import { AppError, type ValidationIssue } from '../../http/errors.js';

export interface HealthDeps {
  instanceId: string;
  version: string;
  checkDatabase: () => Promise<void>;
  checkStorage: () => Promise<void>;
}

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout(task: () => Promise<void>): Promise<void> {
  return Promise.race([
    task(),
    new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS).unref()),
  ]);
}

/** API-01 liveness (không chạm DB/storage, D-14) và API-02 readiness. */
export function healthRoutes(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      data: { status: 'ok', instanceId: deps.instanceId, version: deps.version, uptimeSeconds: Math.floor(process.uptime()) },
    });
  });

  router.get('/ready', async (_req, res) => {
    const [database, storage] = await Promise.allSettled([withTimeout(deps.checkDatabase), withTimeout(deps.checkStorage)]);
    const details: ValidationIssue[] = [];
    if (database.status === 'rejected') {
      details.push({ field: 'database', issue: 'UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu.' });
    }
    if (storage.status === 'rejected') {
      details.push({ field: 'storage', issue: 'UNAVAILABLE', message: 'Không kết nối được kho lưu trữ tệp.' });
    }
    if (details.length > 0) throw new AppError('SERVICE_UNAVAILABLE', { details });
    res.json({ data: { status: 'ready', instanceId: deps.instanceId, checks: { database: 'ok', storage: 'ok' } } });
  });

  return router;
}
