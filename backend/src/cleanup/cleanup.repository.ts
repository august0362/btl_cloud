import type { CleanupReason, PrismaClient, StorageCleanupTask } from '@prisma/client';
import type { Db } from '../db/prisma.js';

export class CleanupTaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** `db` = transaction client khi task phải commit cùng nghiệp vụ; bỏ qua để ghi ngay. */
  async insert(
    task: { storageKey: string; reason: CleanupReason; documentId: string | null; nextAttemptAt: Date },
    db: Db = this.prisma,
  ): Promise<bigint> {
    const created = await db.storageCleanupTask.create({ data: task, select: { id: true } });
    return created.id;
  }

  /** Tiêu thụ guard: chỉ xoá khi chưa bị worker claim (INV-C3). Trả số dòng bị xoá. */
  async deleteUnclaimedGuard(db: Db, storageKey: string): Promise<number> {
    const result = await db.storageCleanupTask.deleteMany({ where: { storageKey, reason: 'UPLOAD_GUARD', attempts: 0 } });
    return result.count;
  }

  /** Bù trừ: đặt guard chưa bị claim đến hạn ngay. Trả id nếu đã đặt được. */
  async markGuardDueNow(storageKey: string, now: Date): Promise<bigint | null> {
    const result = await this.prisma.storageCleanupTask.updateMany({
      where: { storageKey, reason: 'UPLOAD_GUARD', attempts: 0 },
      data: { nextAttemptAt: now },
    });
    if (result.count !== 1) return null;
    const task = await this.prisma.storageCleanupTask.findUnique({ where: { storageKey }, select: { id: true } });
    return task?.id ?? null;
  }

  async findDueIds(now: Date, limit: number): Promise<bigint[]> {
    const rows = await this.prisma.storageCleanupTask.findMany({
      where: { nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Claim nguyên tử: một câu UPDATE có điều kiện; chỉ một tiến trình thắng (D-10). */
  async claim(id: bigint, now: Date, leaseUntil: Date): Promise<boolean> {
    const result = await this.prisma.storageCleanupTask.updateMany({
      where: { id, nextAttemptAt: { lte: now } },
      data: { attempts: { increment: 1 }, nextAttemptAt: leaseUntil },
    });
    return result.count === 1;
  }

  findById(id: bigint): Promise<StorageCleanupTask | null> {
    return this.prisma.storageCleanupTask.findUnique({ where: { id } });
  }

  async reschedule(id: bigint, nextAttemptAt: Date, lastError: string): Promise<void> {
    await this.prisma.storageCleanupTask.updateMany({ where: { id }, data: { nextAttemptAt, lastError: lastError.slice(0, 1000) } });
  }

  async delete(id: bigint): Promise<void> {
    await this.prisma.storageCleanupTask.deleteMany({ where: { id } });
  }
}
