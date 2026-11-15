import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DocumentRepository, type NewDocumentRow } from '../../src/modules/documents/document.repository.js';
import { createTestContext, registerUser, resetDatabase, type TestContext } from './context.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); });
afterAll(async () => { await ctx.close(); });
beforeEach(async () => { await resetDatabase(ctx.prisma); });

function row(ownerId: string, title: string, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC'): NewDocumentRow {
  const now = new Date();
  return { id: randomUUID(), ownerId, title, description: null, visibility, fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'fixture.pdf', sizeBytes: 20, storageKey: randomUUID(), createdAt: now, updatedAt: now, fileUpdatedAt: now };
}

describe('foundation repository', () => {
  it('preserves input order and excludes private and deleting owners', async () => {
    const owner = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const repo = new DocumentRepository(ctx.prisma);
    const a = row(owner.id, 'a'); const b = row(owner.id, 'b'); const privateRow = row(owner.id, 'private', 'PRIVATE'); const deleting = row(other.id, 'deleting');
    for (const entry of [a, b, privateRow, deleting]) await repo.insert(entry);
    await ctx.prisma.user.update({ where: { id: other.id }, data: { deletionStartedAt: new Date() } });
    expect((await repo.findDiscoverableByIds([b.id, privateRow.id, deleting.id, a.id])).map((d) => d.id)).toEqual([b.id, a.id]);
    await ctx.prisma.document.update({ where: { id: b.id }, data: { visibility: 'PRIVATE' } });
    expect((await repo.findDiscoverableByIds([b.id, a.id])).map((d) => d.id)).toEqual([a.id]);
    await expect(repo.findDiscoverableByIds(Array.from({ length: 101 }, () => a.id))).rejects.toThrow(RangeError);
  });
  it('supports rollback for insert/updateFile and keeps legacy return behavior', async () => {
    const owner = await registerUser(ctx.app);
    const repo = new DocumentRepository(ctx.prisma);
    const doc = row(owner.id, 'transaction');
    await expect(ctx.prisma.$transaction(async (tx) => { await repo.insert(doc, tx); throw new Error('rollback'); })).rejects.toThrow('rollback');
    expect(await repo.findById(doc.id)).toBeNull();
    await repo.insert(doc);
    await expect(ctx.prisma.$transaction(async (tx) => {
      expect(await repo.updateFile(doc.id, { storageKey: randomUUID(), fileType: 'DOCX', mimeType: 'application/docx', originalFilename: 'new.docx', sizeBytes: 30 }, new Date(), tx)).toBe(1);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect((await repo.findById(doc.id))?.fileVersion).toBe(1);
  });
  it('ranks title matches first, escapes LIKE metacharacters and paginates without losing count', async () => {
    const owner = await registerUser(ctx.app);
    const repo = new DocumentRepository(ctx.prisma);
    const title = row(owner.id, '100% math'); const description = { ...row(owner.id, 'other'), description: '100% math' };
    await repo.insert(description); await repo.insert(title); await repo.insert(row(owner.id, '1000 math')); await repo.insert(row(owner.id, '100% hidden', 'PRIVATE'));
    const first = await repo.searchRelevanceOrdered({ q: '100%', offset: 0, limit: 1 });
    expect(first.total).toBe(2); expect(first.rows.map((d) => d.id)).toEqual([title.id]);
    expect((await repo.searchRelevanceOrdered({ q: '100%', offset: 1, limit: 1 })).rows.map((d) => d.id)).toEqual([description.id]);
    expect((await repo.searchRelevanceOrdered({ q: '100%', fileType: 'DOCX', offset: 0, limit: 5 })).total).toBe(0);
  });
  it('cascades fingerprints/interactions and defaults opt-in false', async () => {
    const owner = await registerUser(ctx.app); const viewer = await registerUser(ctx.app);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).personalizationEnabled).toBe(false);
    const doc = row(owner.id, 'cascade'); await new DocumentRepository(ctx.prisma).insert(doc);
    await ctx.prisma.documentFingerprint.create({ data: { documentId: doc.id, fileVersion: 1, sha256: 'a'.repeat(64), algoVersion: 1, textStatus: 'SKIPPED' } });
    await ctx.prisma.documentInteraction.create({ data: { userId: viewer.id, documentId: doc.id, kind: 'VIEW', firstAt: new Date(), lastAt: new Date() } });
    await ctx.prisma.document.delete({ where: { id: doc.id } });
    expect(await ctx.prisma.documentFingerprint.count()).toBe(0); expect(await ctx.prisma.documentInteraction.count()).toBe(0);
  });
});
