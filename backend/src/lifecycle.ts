import type { Logger } from './lib/logger.js';

export interface ShutdownDeps {
  logger: Logger;
  closeServer: () => Promise<void>;
  disconnectDatabase: () => Promise<void>;
  destroyStorage: () => void;
  exit: (code: number) => void;
  timeoutMs: number;
}

/**
 * Tắt êm (§A10.5): ngừng nhận kết nối và chờ request đang chạy → đóng DB → thoát 0.
 * Quá timeoutMs thì buộc thoát 1. Gọi nhiều lần (SIGTERM rồi SIGINT) chỉ chạy một lần.
 */
export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let started = false;
  return async (signal: string) => {
    if (started) return;
    started = true;
    deps.logger.info({ signal, event: 'server.shutdown' }, 'Đang tắt êm');
    const timer = setTimeout(() => {
      deps.logger.error({ event: 'server.shutdown_timeout' }, 'Quá thời gian tắt êm, buộc thoát');
      deps.exit(1);
    }, deps.timeoutMs);
    timer.unref();
    try {
      await deps.closeServer();
      await deps.disconnectDatabase();
      deps.destroyStorage();
      clearTimeout(timer);
      deps.exit(0);
    } catch (error) {
      clearTimeout(timer);
      deps.logger.error({ err: error, event: 'server.shutdown_failed' }, 'Lỗi khi tắt');
      deps.exit(1);
    }
  };
}
