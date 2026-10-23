import type { PrismaClient, Session, User } from '@prisma/client';
import type { Db } from '../../db/prisma.js';

export type SessionWithUser = Session & { user: User };

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { id: string; userId: string; expiresAt: Date }, db: Db = this.prisma): Promise<void> {
    await db.session.create({ data });
  }

  findWithUser(id: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({ where: { id }, include: { user: true } });
  }

  /** Idempotent: không lỗi khi phiên đã bị xoá. */
  async delete(id: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id } });
  }

  deleteExpired(now: Date, limit: number): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM sessions WHERE expires_at < ${now} LIMIT ${limit}`;
  }
}
