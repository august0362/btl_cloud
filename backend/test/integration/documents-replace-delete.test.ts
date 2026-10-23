import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectDocument, expectError } from '../helpers/contract.js';
import { docxBuffer, pdfBuffer, sha256, textBuffer } from '../helpers/fixtures.js';
import {
  binaryParser,
  CSRF,
  createTestContext,
  objectExists,
  registerUser,
  resetDatabase,
  uploadDocument,
  type TestContext,
  type TestUser,
} from './context.js';

let ctx: TestContext;
let alice: TestUser;
let doc: { id: string };
const oldBytes = pdfBuffer('phien ban cu');

beforeAll(async () => {
  // Ân hạn 0 giây để task REPLACED đến hạn ngay (§A10.2 cột Test).
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  ctx.storage.reset();
  await resetDatabase(ctx.prisma);
  alice = await registerUser(ctx.app, 'Alice');
  doc = await uploadDocument(alice, { title: 'Bài giảng', description: 'Mô tả', visibility: 'PUBLIC', file: oldBytes, filename: 'cu.pdf' });
  ctx.storage.reset();
});

async function row() {
  return ctx.prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
}

async function download(agent: request.Agent): Promise<Buffer> {
  const res = await agent.get(`/api/documents/${doc.id}/download`).buffer(true).parse(binaryParser);
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

function replace(file: Buffer, filename: string) {
  return alice.agent.put(`/api/documents/${doc.id}/file`).set(CSRF).attach('file', file, filename);
}

describe('API-12 thay tệp thành công (FR-08, SEQ-07)', () => {
  it('AC-08.1: key mới ≠ key cũ, fileVersion+1, visibility/title/description giữ nguyên, có thể đổi loại tệp', async () => {
    const before = await row();
    const newBytes = await docxBuffer('phien ban moi');
    const res = await replace(newBytes, 'Bản mới.docx');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const dto = expectDocument(res.body.data);
    expect(dto).toMatchObject({ fileVersion: 2, fileType: 'DOCX', originalFilename: 'Bản mới.docx', visibility: 'PUBLIC', title: 'Bài giảng', description: 'Mô tả', sizeBytes: newBytes.length });
    const after = await row();
    expect(after.storageKey).not.toBe(before.storageKey);
    expect(after.fileUpdatedAt.getTime()).toBeGreaterThanOrEqual(before.fileUpdatedAt.getTime());
    expect(sha256(await download(alice.agent))).toBe(sha256(newBytes));

    // Task REPLACED cho key cũ; chưa chạy worker thì object cũ vẫn còn (ân hạn D-09).
    const task = await ctx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { storageKey: before.storageKey } });
    expect(task).toMatchObject({ reason: 'REPLACED', documentId: doc.id, attempts: 0 });
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(true);

    // AC-08.3: sau ân hạn worker xoá object cũ; object mới còn nguyên.
    expect(await ctx.services.cleanup.runDueTasks(20)).toBe(1);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(false);
    expect(await objectExists(ctx.s3, after.storageKey)).toBe(true);
  });

  it('Private giữ nguyên Private sau khi thay tệp (BR-07)', async () => {
    await alice.agent.patch(`/api/documents/${doc.id}`).set(CSRF).send({ visibility: 'PRIVATE' });
    const res = await replace(pdfBuffer('moi'), 'moi.pdf');
    expect(res.body.data.visibility).toBe('PRIVATE');
    expect((await request(ctx.app).get('/api/documents')).body.data.totalItems).toBe(0);
  });

  it('task REPLACED tôn trọng ân hạn: grace > 0 → worker chưa xoá object cũ', async () => {
    const graceCtx = await createTestContext({ CLEANUP_GRACE_SECONDS: '120' });
    try {
      const agent = request.agent(graceCtx.app);
      await agent.post('/api/auth/login').set(CSRF).send({ email: alice.email, password: 'matkhau123' });
      const before = await row();
      const res = await agent.put(`/api/documents/${doc.id}/file`).set(CSRF).attach('file', pdfBuffer('moi'), 'moi.pdf');
      expect(res.status).toBe(200);
      const task = await graceCtx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { storageKey: before.storageKey } });
      expect(task.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(100_000);
      expect(await graceCtx.services.cleanup.runDueTasks(20)).toBe(0);
      expect(await objectExists(graceCtx.s3, before.storageKey)).toBe(true);
    } finally {
      await graceCtx.close();
    }
  });
});

describe('API-12 thay tệp thất bại giữ tệp cũ (SEQ-08, AC-08.2)', () => {
  it('PutObject lỗi → 503; tài liệu vẫn trỏ tệp cũ, tải xuống ra byte cũ; không task thừa', async () => {
    const before = await row();
    ctx.storage.failPut = 1;
    expectError(await replace(pdfBuffer('moi'), 'moi.pdf'), 503, 'STORAGE_UNAVAILABLE');
    const after = await row();
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.fileVersion).toBe(1);
    expect(sha256(await download(alice.agent))).toBe(sha256(oldBytes));
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
  });

  it('xung đột phiên bản (thao tác khác đổi file_version) → 409 CONFLICT; object mới bị xoá, tệp cũ còn', async () => {
    ctx.storage.afterPut = async () => {
      await ctx.prisma.$executeRaw`UPDATE documents SET file_version = file_version + 1 WHERE id = ${doc.id}`;
    };
    const before = await row();
    expectError(await replace(pdfBuffer('moi'), 'moi.pdf'), 409, 'CONFLICT');
    const newKey = ctx.storage.putKeys[0] as string;
    expect(await objectExists(ctx.s3, newKey)).toBe(false);
    expect((await row()).storageKey).toBe(before.storageKey);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(true);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
  });

  it('tài liệu bị xoá đồng thời → 404; object mới bị xoá', async () => {
    ctx.storage.afterPut = async () => {
      await ctx.prisma.$executeRaw`DELETE FROM documents WHERE id = ${doc.id}`;
    };
    expectError(await replace(pdfBuffer('moi'), 'moi.pdf'), 404, 'DOCUMENT_NOT_FOUND');
    expect(await objectExists(ctx.s3, ctx.storage.putKeys[0] as string)).toBe(false);
  });

  it('tệp mới không hợp lệ / part lạ → lỗi, không PutObject, không đổi gì', async () => {
    expectError(await replace(textBuffer(), 'gia.pdf'), 415, 'UNSUPPORTED_FILE_TYPE');
    const extra = await alice.agent.put(`/api/documents/${doc.id}/file`).set(CSRF).field('visibility', 'PRIVATE').attach('file', pdfBuffer(), 'a.pdf');
    expect(expectError(extra, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['visibility:UNKNOWN_FIELD']);
    const noFile = await alice.agent.put(`/api/documents/${doc.id}/file`).set(CSRF).send({});
    expect(expectError(noFile, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['file:REQUIRED']);
    expect(ctx.storage.putKeys).toEqual([]);
    expect((await row()).fileVersion).toBe(1);
  });

  it('xoá object cũ sau COMMIT thất bại → vẫn 200; task có backoff, lần sau xoá được (phục hồi được)', async () => {
    const before = await row();
    expect((await replace(pdfBuffer('moi'), 'moi.pdf')).status).toBe(200);
    ctx.storage.failDelete = 1;
    expect(await ctx.services.cleanup.runDueTasks(20)).toBe(1);
    const task = await ctx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { storageKey: before.storageKey } });
    expect(task.attempts).toBe(1);
    expect(task.lastError).toContain('Giả lập lỗi storage');
    expect(task.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    await ctx.prisma.storageCleanupTask.updateMany({ data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await ctx.services.cleanup.runDueTasks(20)).toBe(1);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(false);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
  });
});

describe('API-14 xoá vĩnh viễn (FR-09, SEQ-09)', () => {
  it('AC-09.1/AC-09.2: 204, bản ghi mất, object mất ngay, không còn task, 404 ở mọi endpoint', async () => {
    const before = await row();
    const res = await alice.agent.delete(`/api/documents/${doc.id}`).set(CSRF);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await ctx.prisma.document.count()).toBe(0);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(false);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
    expectError(await alice.agent.get(`/api/documents/${doc.id}`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await alice.agent.get(`/api/documents/${doc.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await alice.agent.delete(`/api/documents/${doc.id}`).set(CSRF), 404, 'DOCUMENT_NOT_FOUND');
  });

  it('lỗi một phần: storage lỗi khi xoá object → vẫn 204, bản ghi mất, task ở lại; worker thử lại thành công', async () => {
    const before = await row();
    ctx.storage.failDelete = 1;
    expect((await alice.agent.delete(`/api/documents/${doc.id}`).set(CSRF)).status).toBe(204);
    expect(await ctx.prisma.document.count()).toBe(0);
    const task = await ctx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { storageKey: before.storageKey } });
    expect(task).toMatchObject({ reason: 'DELETED', attempts: 1, documentId: doc.id });
    expect(task.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(true);
    // Tài liệu đã biến mất khỏi mọi endpoint dù object chưa bị xoá.
    expect((await request(ctx.app).get('/api/documents')).body.data.totalItems).toBe(0);

    await ctx.prisma.storageCleanupTask.updateMany({ data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await ctx.services.cleanup.runDueTasks(20)).toBe(1);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(false);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
  });

  it('DocumentService.delete với bản chụp cũ (thay tệp xen giữa) → thử lại 1 lần, xoá đúng key hiện hành', async () => {
    const stale = await ctx.services.documents.findById(doc.id);
    expect((await replace(pdfBuffer('moi'), 'moi.pdf')).status).toBe(200);
    const current = await row();
    await ctx.services.documentService.delete(stale!);
    expect(await ctx.prisma.document.count()).toBe(0);
    expect(await objectExists(ctx.s3, current.storageKey)).toBe(false);
  });
});
