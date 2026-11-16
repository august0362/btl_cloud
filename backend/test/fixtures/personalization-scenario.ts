import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { REC_EVAL } from './rec-eval.js';
import { TEST_ENV } from '../helpers/config.js';
import { cleanupTestData, createTestContext, registerUser, resetDatabase } from '../integration/context.js';

/** Real HTTP/DB/storage fixture; interaction history is created by client requests. */
export async function createPersonalizationScenario(overrides: Record<string, string> = {}) {
  process.env.AWS_ACCESS_KEY_ID = TEST_ENV.AWS_ACCESS_KEY_ID;
  process.env.AWS_SECRET_ACCESS_KEY = TEST_ENV.AWS_SECRET_ACCESS_KEY;
  const ctx = await createTestContext({ DUPLICATE_MODE: 'block', ...overrides });
  const db = new URL(ctx.config.databaseUrl);
  const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if (!db.pathname.endsWith('_test') || !loopback(db.hostname) ||
      !ctx.config.s3.bucket.endsWith('-test') || !loopback(new URL(ctx.config.s3.endpoint!).hostname)) {
    await ctx.close();
    throw new Error('Personalization scenarios require a local _test database and a local -test bucket.');
  }
  const close = async () => {
    try { await cleanupTestData(ctx); } finally { await ctx.close(); }
  };
  try {
    await ctx.s3.ensureBucket();
    await resetDatabase(ctx.prisma);
    const owner = await registerUser(ctx.app, 'Catalog owner');
    const deletingOwner = await registerUser(ctx.app, 'Deleting catalog owner');
    const ids = REC_EVAL.map(() => randomUUID());
    const filePath = fileURLToPath(new URL('./duplicate-documents/original.pdf', import.meta.url));
    const sizeBytes = (await stat(filePath)).size;
    // Ranking uses titles/descriptions. Seed the same three-topic catalog as the
    // ranking tests; keep real PDF objects for the two download history sources.
    await ctx.prisma.document.createMany({ data: REC_EVAL.map((row, index) => ({
      id: ids[index]!, ownerId: row.deleting ? deletingOwner.id : owner.id,
      title: row.title, description: row.description, visibility: row.visibility,
      fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'original.pdf',
      sizeBytes, storageKey: `personalization-tests/${ids[index]}.pdf`,
      createdAt: row.createdAt, updatedAt: row.createdAt, fileUpdatedAt: row.createdAt,
    })) });
    await ctx.prisma.user.update({ where: { id: deletingOwner.id }, data: { deletionStartedAt: new Date() } });
    for (const index of [0, 10]) {
      await ctx.storage.putObject({ key: `personalization-tests/${ids[index]}.pdf`, filePath, contentType: 'application/pdf', contentLength: sizeBytes });
    }
    await ctx.services.recommendations.index.refresh();
    return { ctx, owner, ids, close };
  } catch (error) {
    await close();
    throw error;
  }
}
