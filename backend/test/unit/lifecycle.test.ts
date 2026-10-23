import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../../src/lifecycle.js';
import { createLogger } from '../../src/lib/logger.js';

const logger = createLogger({ level: 'silent', instanceId: 't' });

function deps(overrides: Partial<Parameters<typeof createShutdown>[0]> = {}) {
  const calls: string[] = [];
  const base = {
    logger,
    stopWorker: vi.fn(async () => void calls.push('stopWorker')),
    closeServer: vi.fn(async () => void calls.push('closeServer')),
    disconnectDatabase: vi.fn(async () => void calls.push('disconnectDatabase')),
    destroyStorage: vi.fn(() => void calls.push('destroyStorage')),
    exit: vi.fn((code: number) => void calls.push(`exit:${code}`)),
    timeoutMs: 1000,
    ...overrides,
  };
  return { base, calls };
}

/** Graceful shutdown (M1-07, M2-13, §A10.5) — logic được gọi bởi handler SIGTERM/SIGINT trong server.ts. */
describe('createShutdown', () => {
  it('dừng worker → đóng server (chờ request) → ngắt DB → huỷ storage client → thoát 0', async () => {
    const { base, calls } = deps();
    await createShutdown(base)('SIGTERM');
    expect(calls).toEqual(['stopWorker', 'closeServer', 'disconnectDatabase', 'destroyStorage', 'exit:0']);
  });

  it('nhận tín hiệu lần hai (SIGINT sau SIGTERM) không chạy lại', async () => {
    const { base, calls } = deps();
    const shutdown = createShutdown(base);
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(calls.filter((c) => c === 'stopWorker')).toHaveLength(1);
    expect(base.exit).toHaveBeenCalledTimes(1);
  });

  it('request treo quá timeout → buộc thoát 1', async () => {
    vi.useFakeTimers();
    try {
      const { base } = deps({ closeServer: vi.fn(() => new Promise<void>(() => undefined)), timeoutMs: 30_000 });
      void createShutdown(base)('SIGTERM');
      await vi.advanceTimersByTimeAsync(30_001);
      expect(base.exit).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
