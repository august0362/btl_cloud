import type { PrismaClient, User } from '@prisma/client';
import type { Db } from '../../db/prisma.js';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: { id: string; email: string; passwordHash: string; displayName: string }, db: Db = this.prisma): Promise<User> {
    return db.user.create({ data });
  }
}
