import { createHash } from 'node:crypto';
import { ZipFile } from 'yazl';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { DuplicateRepository } from '../../src/modules/duplicates/duplicate.repository.js';
import { canView } from '../../src/modules/documents/document.policy.js';
import { createTestContext, registerUser, resetDatabase, uploadRequest, CSRF, type TestContext, type TestUser } from './context.js';
import { uploadResultSchema } from '../helpers/contract.js';
const pdf = (label: string) => Buffer.from(`%PDF-1.7\n${label}\n%%EOF`);
let block: TestContext, second: TestContext, warn: TestContext, off: TestContext;
beforeAll(async () => { block = await createTestContext({ DUPLICATE_MODE: 'block' }); second = await createTestContext({ DUPLICATE_MODE: 'block' }); warn = await createTestContext({ DUPLICATE_MODE: 'warn' }); off = await createTestContext({ DUPLICATE_MODE: 'off' }); });
afterAll(async () => { await Promise.all([block, second, warn, off].map((ctx) => ctx.close())); });
beforeEach(async () => { await resetDatabase(block.prisma); for (const ctx of [block, second, warn, off]) ctx.storage.reset(); vi.restoreAllMocks(); });
const upload = (user: TestUser, bytes: Buffer, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC', title = 'Document') => uploadRequest(user, { title, visibility, file: bytes });
async function privacy(res: request.Response, viewerId: string) {
  const matches = res.status === 409 ? res.body.error.duplicates : [...res.body.data.duplicateCheck.exactMatches, ...res.body.data.duplicateCheck.textMatches];
  for (const match of matches) { const doc = await block.services.documents.findById(match.documentId); expect(doc).not.toBeNull(); expect(canView(doc!, { userId: viewerId })).toBe('ALLOW'); }
}
async function office(words: string, metadata = ''): Promise<Buffer> { const z = new ZipFile(); z.addBuffer(Buffer.from('<Types/>'), '[Content_Types].xml'); z.addBuffer(Buffer.from(`<w:document><w:p><w:t>${words}</w:t></w:p></w:document>`), 'word/document.xml'); z.addBuffer(Buffer.from(metadata), 'docProps/core.xml'); const chunks: Buffer[] = []; const done = (async () => { for await (const c of z.outputStream) chunks.push(Buffer.from(c)); })(); z.end(); await done; return Buffer.concat(chunks); }
describe('duplicate upload and replacement', () => {
  it('blocks exact own files before S3, including private copies, and preserves legacy validation order', async () => {
    const owner = await registerUser(block.app); const bytes = pdf('own');
    const first = await upload(owner, bytes, 'PRIVATE'); expect(first.status).toBe(201); uploadResultSchema.parse(first.body.data);
    for (const visibility of ['PUBLIC', 'PRIVATE'] as const) { const res = await upload(owner, bytes, visibility); expect(res.status).toBe(409); expect(res.body.error.duplicates[0].documentId).toBe(first.body.data.id); await privacy(res, owner.id); }
    expect(block.storage.putKeys).toHaveLength(1); expect(await block.prisma.document.count()).toBe(1);
    const invalid = await owner.agent.post('/api/documents').set(CSRF).field('title', 'x').field('visibility', 'PUBLIC').attach('file', Buffer.from('fake'), 'fake.pdf'); expect(invalid.status).toBe(415);
    expect((await request(block.app).post('/api/documents').set(CSRF)).status).toBe(401);
  });
  it('warns/off retains SHA, same-name different bytes is not exact', async () => {
    for (const ctx of [warn, off]) {
      const user = await registerUser(ctx.app); const a = await upload(user, pdf(`mode-${ctx.config.duplicates.mode}`)); const b = await upload(user, pdf(`mode-${ctx.config.duplicates.mode}`));
      expect(b.status).toBe(201); expect(b.body.data.duplicateCheck.result).toBe(ctx === warn ? 'WARNING' : 'ACCEPT');
      if (ctx === off) expect(b.body.data.duplicateCheck.textAnalysis.reason).toBe('DISABLED');
      const fingerprint = await ctx.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: a.body.data.id } }); expect(fingerprint.sha256).toBe(createHash('sha256').update(pdf(`mode-${ctx.config.duplicates.mode}`)).digest('hex'));
      expect((await upload(user, pdf(`different-${ctx.config.duplicates.mode}`))).body.data.duplicateCheck.exactMatches).toEqual([]);
    }
  });
  it('never exposes private/deleting owners, rechecks visibility, and permits private copy of public bytes', async () => {
    const a = await registerUser(block.app), b = await registerUser(block.app); const bytes = pdf('privacy');
    const first = await upload(a, bytes, 'PRIVATE', 'Secret title');
    const hidden = await upload(b, bytes); expect(hidden.status).toBe(201); expect(JSON.stringify(hidden.body)).not.toContain(first.body.data.id); expect(JSON.stringify(hidden.body)).not.toContain('Secret title');
    await b.agent.delete(`/api/documents/${hidden.body.data.id}`).set(CSRF);
    await a.agent.patch(`/api/documents/${first.body.data.id}`).set(CSRF).send({ visibility: 'PUBLIC' });
    const conflict = await upload(b, bytes); expect(conflict.status).toBe(409); await privacy(conflict, b.id);
    const copy = await upload(b, bytes, 'PRIVATE'); expect(copy.status).toBe(201); expect(copy.body.data.duplicateCheck.result).toBe('WARNING'); await privacy(copy, b.id);
    await b.agent.delete(`/api/documents/${copy.body.data.id}`).set(CSRF);
    await a.agent.patch(`/api/documents/${first.body.data.id}`).set(CSRF).send({ visibility: 'PRIVATE' });
    const privateAgain = await upload(b, bytes); expect(privateAgain.body.data.duplicateCheck.exactMatches).toEqual([]);
    await b.agent.delete(`/api/documents/${privateAgain.body.data.id}`).set(CSRF);
    await block.prisma.user.update({ where: { id: a.id }, data: { deletionStartedAt: new Date() } });
    const c = await registerUser(block.app); const deletingResponse = await upload(c, bytes); expect(deletingResponse.body.data.duplicateCheck.exactMatches.every((m: { documentId: string }) => m.documentId !== first.body.data.id)).toBe(true);
  });
  it('uses current replacement visibility, excludes self, preserves old version on conflict and keeps fingerprint version atomic', async () => {
    const a = await registerUser(block.app), b = await registerUser(block.app); const bytes = pdf('public-source'); const source = await upload(a, bytes);
    const target = await upload(b, pdf('target')); const id = target.body.data.id;
    const replace = (body: Buffer) => b.agent.put(`/api/documents/${id}/file`).set(CSRF).attach('file', body, 'file.pdf');
    const conflict = await replace(bytes); expect(conflict.status).toBe(409); expect((await block.prisma.document.findUniqueOrThrow({ where: { id } })).fileVersion).toBe(1);
    await b.agent.patch(`/api/documents/${id}`).set(CSRF).send({ visibility: 'PRIVATE' });
    expect((await replace(bytes)).status).toBe(200);
    const current = await block.prisma.document.findUniqueOrThrow({ where: { id } }); expect((await block.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } })).fileVersion).toBe(current.fileVersion);
    await a.agent.delete(`/api/documents/${source.body.data.id}`).set(CSRF);
    expect((await replace(bytes)).body.data.duplicateCheck.exactMatches).toEqual([]);
    await b.agent.delete(`/api/documents/${id}`).set(CSRF); expect(await block.prisma.documentFingerprint.count()).toBe(0);
    expect((await upload(b, bytes)).body.data.duplicateCheck.result).toBe('ACCEPT');
  });
  it('rolls back DB + fingerprint and compensates object on post-Put failure', async () => {
    const user = await registerUser(block.app); block.storage.failPut = 1;
    expect((await upload(user, pdf('failed-put'))).status).toBe(503); expect(await block.prisma.document.count()).toBe(0); expect(await block.prisma.documentFingerprint.count()).toBe(0);
    vi.spyOn(DuplicateRepository.prototype, 'save').mockRejectedValueOnce(new Error('write failed'));
    const failure = await upload(user, pdf('failed-db')); expect(failure.status).toBe(500); expect(await block.prisma.document.count()).toBe(0);
    await expect(block.s3.getObject(block.storage.putKeys[0]!)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });
  it('serializes twenty concurrent pairs across two independent app/Prisma instances', async () => {
    const user = await registerUser(block.app);
    // Log in to instance two using the already authenticated session cookie via shared DB.
    const email = user.email; const login = await request(second.app).post('/api/auth/login').set(CSRF).send({ email, password: 'matkhau123' }); const cookie = login.headers['set-cookie'];
    for (let i = 0; i < 20; i++) {
      const bytes = pdf(`race-${i}`);
      const [a, b] = await Promise.all([upload(user, bytes), request(second.app).post('/api/documents').set(CSRF).set('Cookie', cookie!).field('title', 'race').field('visibility', 'PUBLIC').attach('file', bytes, 'race.pdf')]);
      expect([a.status, b.status].sort()).toEqual([201, 409]); await privacy(a.status === 409 ? a : b, user.id);
    }
    expect(await block.prisma.document.count()).toBe(20); expect(await block.prisma.documentFingerprint.count()).toBe(20);
    for (const key of [...block.storage.putKeys, ...second.storage.putKeys]) { const exists = await block.prisma.document.count({ where: { storageKey: key } }); if (!exists) await expect(block.s3.getObject(key)).rejects.toMatchObject({ kind: 'NOT_FOUND' }); }
  }, 120000);
  it('warns for same text across different ZIP bytes and near text while never blocking', async () => {
    const user = await registerUser(block.app); const words = Array.from({ length: 2000 }, (_, i) => `word${i}`); const firstBytes = await office(words.join(' '), 'one');
    const first = await uploadRequest(user, { title: 'text', visibility: 'PUBLIC', file: firstBytes, filename: 'first.docx' }); expect(first.status).toBe(201);
    const same = await uploadRequest(user, { title: 'same', visibility: 'PUBLIC', file: await office(words.join(' '), 'two'), filename: 'same.docx' }); expect(same.status).toBe(201); expect(same.body.data.duplicateCheck.textMatches[0]).toMatchObject({ matchType: 'SAME_TEXT', similarity: 1 });
    const nearWords = words.map((w, i) => i % 40 === 0 ? `changed${i}` : w);
    const near = await uploadRequest(user, { title: 'near', visibility: 'PUBLIC', file: await office(nearWords.join(' ')), filename: 'near.docx' }); expect(near.status).toBe(201); expect(near.body.data.duplicateCheck.textMatches[0].matchType).toBe('SIMILAR_TEXT'); expect(near.body.data.duplicateCheck.textMatches[0].similarity).toBeGreaterThanOrEqual(0.6); await privacy(near, user.id);
  });
});

describe('duplicate analysis bounds and maintenance', () => {
  it('caps candidate scan at 2000 and reports truncation', async () => {
    const { randomUUID } = await import('node:crypto');
    const { fingerprintText } = await import('../../src/modules/duplicates/minhash.js');
    const user = await registerUser(warn.app); const words = Array.from({ length: 100 }, (_, i) => `candidate${i}`).join(' '); const fingerprint = fingerprintText(words);
    const now = new Date(); const ids = Array.from({ length: 2001 }, () => randomUUID());
    await warn.prisma.document.createMany({ data: ids.map((id) => ({ id, ownerId: user.id, title: 'candidate', description: null, visibility: 'PUBLIC', fileType: 'DOCX', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalFilename: 'candidate.docx', sizeBytes: 100, storageKey: `seed/${id}`, createdAt: now, updatedAt: now, fileUpdatedAt: now })) });
    await warn.prisma.documentFingerprint.createMany({ data: ids.map((documentId) => ({ documentId, fileVersion: 1, sha256: 'a'.repeat(64), algoVersion: 1, textStatus: 'PARTIAL', textReason: 'PART_LIMIT', shingleCount: fingerprint.shingleCount, minhash: Buffer.from(fingerprint.minhash!) })) });
    const response = await uploadRequest(user, { title: 'scan', visibility: 'PUBLIC', file: await office(words), filename: 'scan.docx' });
    expect(response.status).toBe(201); expect(response.body.data.duplicateCheck.textAnalysis).toMatchObject({ candidatesScanned: 2000, candidatesTruncated: true }); expect(response.body.data.duplicateCheck.textMatches.length).toBeLessThanOrEqual(5);
  });
  it('busy analysis still permits upload and has no similarity percentage', async () => {
    const { TextWorkerPool } = await import('../../src/modules/duplicates/text-worker-pool.js');
    const { skipped } = await import('../../src/modules/duplicates/duplicate.policy.js');
    // Queue saturation is covered by duplicates-workers.test.ts. Here verify
    // the HTTP fallback without racing upload I/O against a worker deadline.
    vi.spyOn(TextWorkerPool.prototype, 'analyze').mockResolvedValue(skipped('BUSY'));
    const user = await registerUser(warn.app);
    const response = await upload(user, pdf('busy'));
    expect(response.status).toBe(201);
    expect(response.body.data.duplicateCheck.textAnalysis).toMatchObject({ status: 'SKIPPED', reason: 'BUSY' });
    expect(response.body.data.duplicateCheck.textMatches).toEqual([]);
  });
  it('backfills idempotently, detects changed keys, and never removes documents', async () => {
    const { TEST_ENV } = await import('../helpers/config.js');
    const { backfill } = await import('../../scripts/backfill-fingerprints.js');
    const { S3ObjectStorage } = await import('../../src/storage/s3-object-storage.js');
    const user = await registerUser(off.app); const document = await upload(user, pdf('backfill')); const id = document.body.data.id;
    for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
    vi.stubEnv('LOG_LEVEL', 'silent'); vi.stubEnv('UPLOAD_TMP_DIR', off.config.upload.tmpDir);
    try {
      await off.prisma.documentFingerprint.deleteMany();
      expect(await backfill()).toMatchObject({ processed: 1, stale: 0 });
      const first = await off.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } });
      expect(await backfill()).toMatchObject({ processed: 0, stale: 0 });
      expect((await off.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } })).sha256).toBe(first.sha256);
      await off.prisma.documentFingerprint.deleteMany();
      const original = S3ObjectStorage.prototype.getObject;
      vi.spyOn(S3ObjectStorage.prototype, 'getObject').mockImplementationOnce(async function (this: InstanceType<typeof S3ObjectStorage>, key: string) { const result = await original.call(this, key); await off.prisma.document.update({ where: { id }, data: { storageKey: `${key}-changed`, fileVersion: { increment: 1 } } }); return result; });
      expect(await backfill()).toMatchObject({ processed: 0, stale: 1 }); expect(await off.prisma.document.count()).toBe(1); expect(await off.prisma.documentFingerprint.count()).toBe(0);
    } finally { vi.unstubAllEnvs(); }
  });
});
