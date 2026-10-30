import type { AuditActorType, AuditOutcome, AuditTargetType, Prisma } from '@prisma/client';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import type { AuditRepository } from './audit.repository.js';

/** Danh mục sự kiện §A12.7: loại đối tượng và các khoá `metadata` được phép. */
export const AUDIT_ACTIONS = {
  AUTH_REGISTER: { targetType: 'USER', metadata: [] },
  AUTH_LOGIN: { targetType: 'USER', metadata: [] },
  AUTH_LOGOUT: { targetType: 'USER', metadata: [] },
  DOCUMENT_UPLOAD: { targetType: 'DOCUMENT', metadata: ['visibility', 'fileType', 'sizeBytes'] },
  DOCUMENT_DOWNLOAD: { targetType: 'DOCUMENT', metadata: [] },
  DOCUMENT_DELETE: { targetType: 'DOCUMENT', metadata: [] },
  DOCUMENT_UPDATE: { targetType: 'DOCUMENT', metadata: ['fields', 'visibility'] },
  DOCUMENT_REPLACE: { targetType: 'DOCUMENT', metadata: ['fileType', 'sizeBytes', 'fileVersion'] },
  PROFILE_UPDATE: { targetType: 'USER', metadata: ['fields'] },
  AVATAR_UPDATE: { targetType: 'USER', metadata: [] },
  AVATAR_DELETE: { targetType: 'USER', metadata: [] },
  FRIEND_REQUEST_SEND: { targetType: 'FRIENDSHIP', metadata: [] },
  FRIEND_REQUEST_ACCEPT: { targetType: 'FRIENDSHIP', metadata: [] },
  FRIEND_REQUEST_DELETE: { targetType: 'FRIENDSHIP', metadata: [] },
  FRIEND_REMOVE: { targetType: 'USER', metadata: [] },
  ADMIN_USER_UPDATE: { targetType: 'USER', metadata: ['fields'] },
  ADMIN_SESSIONS_REVOKE: { targetType: 'USER', metadata: ['revoked'] },
  ADMIN_ACCOUNT_DELETE: { targetType: 'USER', metadata: ['maskedEmail', 'deletedDocuments', 'remainingDocuments'] },
} as const satisfies Record<string, { targetType: AuditTargetType; metadata: readonly string[] }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export interface AuditEventInput {
  actorType: AuditActorType;
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType | null;
  targetId: string | null;
  outcome: AuditOutcome;
  errorCode: string | null;
  requestId: string | null;
  metadata?: Record<string, unknown> | null | undefined;
}

const MAX_METADATA_BYTES = 1024;
const PURGE_BATCH_SIZE = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Chỉ giữ khoá trong allowlist của hành động; > 1 KB → `{ truncated: true }` (XM-13). */
export function sanitizeMetadata(action: AuditAction, metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonObject | null {
  if (!metadata) return null;
  const allowed: readonly string[] = AUDIT_ACTIONS[action].metadata;
  const kept = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => allowed.includes(key) && value !== undefined));
  if (Object.keys(kept).length === 0) return null;
  if (Buffer.byteLength(JSON.stringify(kept), 'utf8') > MAX_METADATA_BYTES) return { truncated: true };
  return kept as Prisma.InputJsonObject;
}

/**
 * XM-13: ghi sự kiện audit sau khi thao tác xong, không chung transaction, không chờ.
 * Ghi lỗi không đổi kết quả thao tác nhưng luôn có log ERROR `audit.write_failed` (XBR-22).
 */
export class AuditRecorder {
  constructor(
    private readonly repository: Pick<AuditRepository, 'insert' | 'deleteOlderThan'>,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Log ERROR `audit.write_failed` kèm `requestId` (XBR-22: không im lặng). */
  reportWriteFailure(error: unknown, action: AuditAction, requestId: string | null): void {
    this.logger.error({ err: error, event: 'audit.write_failed', action, requestId }, 'Không ghi được sự kiện audit');
  }

  record(input: AuditEventInput): void {
    const fail = (error: unknown) => this.reportWriteFailure(error, input.action, input.requestId);
    try {
      this.repository
        .insert({
          createdAt: this.clock.now(),
          actorType: input.actorType,
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          outcome: input.outcome,
          errorCode: input.errorCode,
          requestId: input.requestId,
          metadata: sanitizeMetadata(input.action, input.metadata),
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  /**
   * Xoá sự kiện quá `retentionDays` theo lô 10 000 tới khi hết (XD-14, chạy lúc khởi động).
   * Mốc thời gian tính từ clock của app như `sessions.deleteExpired`. Lỗi → WARN, không ném.
   */
  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - retentionDays * DAY_MS);
    let deleted = 0;
    try {
      for (;;) {
        const count = await this.repository.deleteOlderThan(cutoff, PURGE_BATCH_SIZE);
        deleted += count;
        if (count < PURGE_BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.warn({ err: error, event: 'audit.purge_failed', deleted }, 'Chưa xoá được sự kiện audit quá hạn');
    }
    return deleted;
  }
}
