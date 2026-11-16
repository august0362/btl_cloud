import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ZipFile } from 'yazl';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { DocumentRepository } from '../../src/modules/documents/document.repository.js';
import { DocumentService } from '../../src/modules/documents/documents.service.js';
import { DuplicateRepository } from '../../src/modules/duplicates/duplicate.repository.js';
import { DuplicateService } from '../../src/modules/duplicates/duplicate.service.js';
import { createLogger } from '../../src/lib/logger.js';
import { inspectFile } from '../../src/modules/files/file-inspector.js';
import { TEST_ENV } from '../helpers/config.js';
import { createTestContext, registerUser, resetDatabase, type TestContext } from './context.js';
let ctx: TestContext;
beforeAll(async () => { ctx = await createTestContext(); await resetDatabase(ctx.prisma); });
afterAll(async () => { await ctx.close(); });
it('records physical SQL counts without logging SQL parameters or sacrificing required safeguards', async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_ENV.DATABASE_URL } }, log: [{ emit: 'event', level: 'query' }] });
  let queries: string[] = [];
  prisma.$on('query', (event) => { queries.push(event.query); });
  const dir = await mkdtemp(path.join(tmpdir(), 'duplicate-query-count-')); const file = path.join(dir, 'fixture.docx');
  const zip = new ZipFile(); zip.addBuffer(Buffer.from('<Types/>'), '[Content_Types].xml'); zip.addBuffer(Buffer.from(`<w:document><w:p><w:t>${Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ')}</w:t></w:p></w:document>`), 'word/document.xml');
  const chunks: Buffer[] = []; const reading = (async () => { for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk)); })(); zip.end(); await reading;
  const bytes = Buffer.concat(chunks); await writeFile(file, bytes); const inspected = await inspectFile(file, 'fixture.docx', bytes.length);
  const logger = createLogger({ level: 'silent', instanceId: 'query-budget' }); const measurements = [];
  try {
    for (const mode of ['off', 'warn', 'block'] as const) {
      const user = await registerUser(ctx.app); const documents = new DocumentRepository(prisma);
      const service = new DocumentService(documents, ctx.storage, ctx.services.clock, logger, new DuplicateService(new DuplicateRepository(prisma), mode, logger));
      queries = []; const doc = await service.create(user.id, { title: 'query count', visibility: 'PRIVATE' }, inspected);
      measurements.push({ mode, operation: 'upload', physicalSql: queries.length, dataSql: queries.filter((q) => !/^(SET|BEGIN|COMMIT|ROLLBACK)/.test(q)).length, fingerprintSql: queries.filter((q) => q.includes('document_fingerprints')).length, userLocks: queries.filter((q) => /users.*FOR UPDATE/.test(q)).length });
      const loaded = (await documents.findById(doc.id))!;
      queries = []; await service.replaceFile(loaded, inspected, user.id);
      measurements.push({ mode, operation: 'replace', physicalSql: queries.length, dataSql: queries.filter((q) => !/^(SET|BEGIN|COMMIT|ROLLBACK)/.test(q)).length, fingerprintSql: queries.filter((q) => q.includes('document_fingerprints')).length, userLocks: queries.filter((q) => /users.*FOR UPDATE/.test(q)).length });
    }
    expect(measurements.filter((m) => m.mode === 'block').every((m) => m.userLocks === 1)).toBe(true);
    await writeFile(path.join(tmpdir(), 'a-query-budget.json'), JSON.stringify(measurements, null, 2));
  } finally { await prisma.$disconnect(); await rm(dir, { recursive: true, force: true }); }
});
