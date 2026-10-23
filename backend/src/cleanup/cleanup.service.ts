import type { CleanupReason } from '@prisma/client';
import type { Db } from '../db/prisma.js';
import type { Clock } from '../lib/clock.js';
import type { Logger } from '../lib/logger.js';
import type { DocumentRepository } from '../modules/documents/document.repository.js';
import type { ObjectStorage } from '../storage/object-storage.js';
import type { CleanupTaskRepository } from './cleanup.repository.js';

const CLAIM_LEASE_MS = 5 * 60 * 1000;
const STUCK_THRESHOLD = 10;

/** Backoff sau lần thất bại thứ n: min(2^(n-1), 60) phút (§A6.8). */
export function backoffMs(attempts: number): number {
  const minutes = Math.min(2 ** Math.max(0, attempts - 1), 60);
  return minutes * 60 * 1000;
}

export type ProcessResult = 'done' | 'skipped_referenced' | 'failed' | 'not_claimed';

/**
 * Đối soát DB ↔ object storage bằng bảng storage_cleanup_tasks (D-07, §A6.8).
 * Mọi object chưa được tham chiếu luôn có task (INV-C2) → mọi lỗi phục hồi được bằng xoá muộn.
 */
export class CleanupService {
  constructor(
    private readonly tasks: CleanupTaskRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly guardMinutes: number,
  ) {}

  /** U5/R6: guard trước PutObject, đến hạn sau UPLOAD_GUARD_MINUTES (crash → worker dọn). */
  async createGuard(storageKey: string, documentId: string): Promise<void> {
    const nextAttemptAt = new Date(this.clock.now().getTime() + this.guardMinutes * 60 * 1000);
    await this.tasks.insert({ storageKey, reason: 'UPLOAD_GUARD', documentId, nextAttemptAt });
  }

  /** U7/R8a: xoá guard trong transaction commit; false nếu guard đã bị worker claim (INV-C3). */
  async consumeGuard(tx: Db, storageKey: string): Promise<boolean> {
    return (await this.tasks.deleteUnclaimedGuard(tx, storageKey)) === 1;
  }

  /** U6/R7: bù trừ — đặt guard đến hạn ngay rồi xử lý (DeleteObject idempotent). Không bao giờ ném lỗi. */
  async releaseGuard(storageKey: string): Promise<void> {
    try {
      const id = await this.tasks.markGuardDueNow(storageKey, this.clock.now());
      if (id !== null) await this.processTask(id);
    } catch (error) {
      this.logger.warn({ err: error, storageKey, event: 'cleanup.release_guard_failed' }, 'Không bù trừ được guard; worker sẽ dọn sau');
    }
  }

  async scheduleDeletion(
    tx: Db,
    task: { storageKey: string; reason: Exclude<CleanupReason, 'UPLOAD_GUARD'>; documentId: string; notBefore: Date },
  ): Promise<bigint> {
    return this.tasks.insert(
      { storageKey: task.storageKey, reason: task.reason, documentId: task.documentId, nextAttemptAt: task.notBefore },
      tx,
    );
  }

  /** Dùng chung cho request và worker; lỗi storage được ghi vào task, không ném ra ngoài. */
  async processTask(id: bigint): Promise<ProcessResult> {
    const now = this.clock.now();
    if (!(await this.tasks.claim(id, now, new Date(now.getTime() + CLAIM_LEASE_MS)))) return 'not_claimed';
    const task = await this.tasks.findById(id);
    if (!task) return 'not_claimed';

    // Lưới an toàn: không bao giờ xoá object còn được documents tham chiếu.
    if (await this.documents.existsByStorageKey(task.storageKey)) {
      await this.tasks.delete(id);
      this.logger.error({ event: 'cleanup.referenced_key_skipped', storageKey: task.storageKey, taskId: id.toString() }, 'Task trỏ tới key đang được tham chiếu');
      return 'skipped_referenced';
    }

    try {
      await this.storage.deleteObject(task.storageKey);
      await this.tasks.delete(id);
      this.logger.debug({ event: 'cleanup.object_deleted', storageKey: task.storageKey, reason: task.reason }, 'Đã xoá object');
      return 'done';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.tasks.reschedule(id, new Date(this.clock.now().getTime() + backoffMs(task.attempts)), message);
      const log = { event: task.attempts >= STUCK_THRESHOLD ? 'cleanup.task_stuck' : 'cleanup.delete_failed', storageKey: task.storageKey, attempts: task.attempts, err: error };
      if (task.attempts >= STUCK_THRESHOLD) this.logger.error(log, 'Task dọn dẹp thất bại nhiều lần');
      else this.logger.warn(log, 'Xoá object thất bại, sẽ thử lại');
      return 'failed';
    }
  }

  async runDueTasks(limit: number): Promise<number> {
    const ids = await this.tasks.findDueIds(this.clock.now(), limit);
    let processed = 0;
    for (const id of ids) {
      try {
        if ((await this.processTask(id)) !== 'not_claimed') processed += 1;
      } catch (error) {
        this.logger.error({ err: error, taskId: id.toString(), event: 'cleanup.process_error' }, 'Lỗi khi xử lý task dọn dẹp');
      }
    }
    return processed;
  }
}
