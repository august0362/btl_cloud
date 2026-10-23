import type { Clock } from '../lib/clock.js';
import type { Logger } from '../lib/logger.js';
import type { SessionRepository } from '../modules/auth/session.repository.js';
import type { CleanupService } from './cleanup.service.js';
import { sweepTmpDir } from './tmp-sweeper.js';

const BATCH_SIZE = 20;
const EXPIRED_SESSION_BATCH = 1000;
const TMP_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_JITTER_MS = 10_000;

/**
 * Chạy trên mọi instance (D-10): mỗi CLEANUP_INTERVAL_SECONDS + jitter, không chạy chồng lượt.
 * Mỗi lượt: task đến hạn → phiên hết hạn → tệp tạm cũ.
 */
export class CleanupWorker {
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<void> | undefined;
  private stopped = true;

  constructor(
    private readonly cleanup: CleanupService,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly options: { intervalSeconds: number; tmpDir: string },
  ) {}

  start(): void {
    this.stopped = false;
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped) return;
    const delay = this.options.intervalSeconds * 1000 + Math.floor(Math.random() * MAX_JITTER_MS);
    this.timer = setTimeout(() => {
      this.current = this.tick().finally(() => {
        this.current = undefined;
        this.schedule();
      });
    }, delay);
    this.timer.unref();
  }

  /** Một lượt dọn dẹp; công khai để test gọi trực tiếp. */
  async tick(): Promise<void> {
    try {
      const processed = await this.cleanup.runDueTasks(BATCH_SIZE);
      const expired = await this.sessions.deleteExpired(this.clock.now(), EXPIRED_SESSION_BATCH);
      const swept = await sweepTmpDir(this.options.tmpDir, TMP_MAX_AGE_MS, this.clock.now());
      if (processed || expired || swept) {
        this.logger.info({ event: 'cleanup.tick', processed, expiredSessions: expired, tmpFilesRemoved: swept }, 'Lượt dọn dẹp');
      }
    } catch (error) {
      this.logger.error({ err: error, event: 'cleanup.tick_failed' }, 'Lượt dọn dẹp thất bại');
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }
}
