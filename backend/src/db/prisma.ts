import { PrismaClient, type Prisma } from '@prisma/client';

/** Client hoặc transaction client — repository nhận cả hai để tham gia transaction của service. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Tạo PrismaClient cho một process (§A3.6). Không dùng singleton toàn cục để test có thể
 * tạo client riêng trỏ tới DB test và tiêm vào createApp().
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
  });
}

/** Service điều phối transaction qua hàm này, không phụ thuộc trực tiếp PrismaClient (§A1.4, §A3.6). */
export type TransactionRunner = <T>(work: (tx: Db) => Promise<T>) => Promise<T>;

export function createTransactionRunner(prisma: PrismaClient): TransactionRunner {
  return (work) => prisma.$transaction((tx) => work(tx));
}

/** Prisma P2002 = vi phạm unique constraint. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/** Prisma P2025 = bản ghi cần cập nhật/xoá không tồn tại. */
export function isRecordNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025';
}
