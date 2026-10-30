import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import type { UserRepository } from './user.repository.js';

const WRITE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TRACKED_USERS = 10_000;

/**
 * XM-01 (E1-FR-04): ghi `users.last_active_at` tối đa 1 lần / 5 phút / user cho mỗi process.
 * Không chờ ghi; lỗi chỉ log, không ảnh hưởng request.
 */
export class ActivityTracker {
  private readonly lastWrites = new Map<string, number>();

  constructor(
    private readonly users: Pick<UserRepository, 'touchLastActive'>,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  touch(userId: string): void {
    const now = this.clock.now();
    const last = this.lastWrites.get(userId);
    if (last !== undefined && now.getTime() - last < WRITE_INTERVAL_MS) return;
    if (this.lastWrites.size >= MAX_TRACKED_USERS) this.lastWrites.clear();
    this.lastWrites.set(userId, now.getTime());
    const fail = (error: unknown) => {
      // Ghi lỗi → cho phép request sau thử lại.
      this.lastWrites.delete(userId);
      this.logger.warn({ err: error, userId, event: 'users.activity_write_failed' }, 'Không ghi được last_active_at');
    };
    try {
      this.users.touchLastActive(userId, now).catch(fail);
    } catch (error) {
      fail(error);
    }
  }
}
