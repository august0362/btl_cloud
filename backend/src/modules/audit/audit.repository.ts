import type { AuditActorType, AuditOutcome, AuditTargetType, Prisma, PrismaClient } from '@prisma/client';

export interface AuditEventRow {
  createdAt: Date;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  targetType: AuditTargetType | null;
  targetId: string | null;
  outcome: AuditOutcome;
  errorCode: string | null;
  requestId: string | null;
  metadata: Prisma.InputJsonObject | null;
}

/** Bảng `audit_events` (§A12.4): chỉ thêm dòng và xoá quá hạn. */
export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: AuditEventRow): Promise<void> {
    await this.prisma.auditEvent.create({ data: { ...row, metadata: row.metadata ?? undefined } });
  }

  /** Xoá tối đa `limit` sự kiện cũ hơn `cutoff`; trả số dòng đã xoá. */
  deleteOlderThan(cutoff: Date, limit: number): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM audit_events WHERE created_at < ${cutoff} LIMIT ${limit}`;
  }
}
