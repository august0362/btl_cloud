import { Prisma, type InteractionKind, type PrismaClient } from '@prisma/client';
import { discoverableSql } from '../documents/document.scope.js';

export interface CorpusRow { id: string; ownerId: string; title: string; description: string | null; createdAt: Date }
export class RecommendationRepository {
  constructor(private readonly prisma: PrismaClient) {}
  corpus(): Promise<CorpusRow[]> {
    return this.prisma.$queryRaw`SELECT d.id, d.owner_id AS ownerId, d.title, d.description, d.created_at AS createdAt FROM documents d WHERE ${discoverableSql()} ORDER BY d.created_at DESC, d.id DESC LIMIT 5000`;
  }
  popularity(since: Date): Promise<{ documentId: string; raw: Prisma.Decimal | number }[]> {
    return this.prisma.$queryRaw`SELECT i.document_id AS documentId, SUM(CASE i.kind WHEN 'DOWNLOAD' THEN 2 ELSE 1 END) AS raw FROM document_interactions i JOIN users u ON u.id = i.user_id AND u.deletion_started_at IS NULL WHERE i.last_at >= ${since} GROUP BY i.document_id`;
  }
  history(userId: string, since: Date) {
    return this.prisma.documentInteraction.findMany({ where: { userId, lastAt: { gte: since }, user: { personalizationEnabled: true, deletionStartedAt: null }, document: { visibility: 'PUBLIC', owner: { deletionStartedAt: null } } }, orderBy: { lastAt: 'desc' }, take: 50, select: { documentId: true, kind: true, lastAt: true } });
  }
  interactedIds(userId: string, since: Date) {
    return this.prisma.documentInteraction.findMany({ where: { userId, lastAt: { gte: since }, user: { personalizationEnabled: true, deletionStartedAt: null } }, distinct: ['documentId'], select: { documentId: true } });
  }
  async settings(userId: string) {
    const [user, historyItems] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { personalizationEnabled: true } }),
      this.prisma.documentInteraction.count({ where: { userId } }),
    ]);
    return { personalizationEnabled: user.personalizationEnabled, historyItems };
  }
  async setSettings(userId: string, personalizationEnabled: boolean) {
    await this.prisma.$transaction(async (db) => {
      await db.user.update({ where: { id: userId }, data: { personalizationEnabled } });
      if (!personalizationEnabled) await db.documentInteraction.deleteMany({ where: { userId } });
    });
    return this.settings(userId);
  }
  async clearHistory(userId: string): Promise<void> { await this.prisma.documentInteraction.deleteMany({ where: { userId } }); }
  async record(userId: string, documentId: string, kind: InteractionKind, now: Date): Promise<void> {
    await this.prisma.$executeRaw`INSERT INTO document_interactions (user_id, document_id, kind, first_at, last_at)
      SELECT u.id, ${documentId}, ${kind}, ${now}, ${now} FROM users u
      WHERE u.id = ${userId} AND u.personalization_enabled = TRUE AND u.deletion_started_at IS NULL
      ON DUPLICATE KEY UPDATE document_interactions.last_at = GREATEST(document_interactions.last_at, ${now})`;
  }
  purge(since: Date): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM document_interactions WHERE last_at < ${since} LIMIT 10000`;
  }
}
