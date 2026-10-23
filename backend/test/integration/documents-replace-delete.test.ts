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
  ctx = await createTestContext({ LOG_LEVEL: 'warn' });
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

    expect(await objectExists(ctx.s3, before.storageKey)).toBe(false);
    expect(await objectExists(ctx.s3, after.storageKey)).toBe(true);
  });

  it('Private giữ nguyên Private sau khi thay tệp (BR-07)', async () => {
    await alice.agent.patch(`/api/documents/${doc.id}`).set(CSRF).send({ visibility: 'PRIVATE' });
    const res = await replace(pdfBuffer('moi'), 'moi.pdf');
    expect(res.body.data.visibility).toBe('PRIVATE');
    expect((await request(ctx.app).get('/api/documents')).body.data.totalItems).toBe(0);
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
  });

  it('hai replace cùng bản chụp: cả hai thành công, lần ghi cuối thắng; counter tăng hai lần', async () => {
    const stale = await ctx.services.documents.findById(doc.id);
    const { inspectFile } = await import('../../src/modules/files/file-inspector.js');
    const { writeTempFile } = await import('../helpers/fixtures.js');
    const first = await inspectFile(await writeTempFile('first.pdf', pdfBuffer('first')), 'first.pdf', pdfBuffer('first').length);
    const last = await inspectFile(await writeTempFile('last.pdf', pdfBuffer('last')), 'last.pdf', pdfBuffer('last').length);
    await ctx.services.documentService.replaceFile(stale!, first, alice.id);
    await ctx.services.documentService.replaceFile(stale!, last, alice.id);
    expect((await row()).fileVersion).toBe(3);
    expect(sha256(await download(alice.agent))).toBe(sha256(pdfBuffer('last')));
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

  it('xoá object cũ lỗi → 200, tệp mới tải được, log storage.orphan', async () => {
    const before = await row();
    ctx.storage.failDelete = 1;
    expect((await replace(pdfBuffer('moi'), 'moi.pdf')).status).toBe(200);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(true);
    expect(sha256(await download(alice.agent))).toBe(sha256(pdfBuffer('moi')));
    const logs = ctx.logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logs).toContainEqual(expect.objectContaining({ level: 40, event: 'storage.orphan', storageKey: before.storageKey }));
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
    expectError(await alice.agent.get(`/api/documents/${doc.id}`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await alice.agent.get(`/api/documents/${doc.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await alice.agent.delete(`/api/documents/${doc.id}`).set(CSRF), 404, 'DOCUMENT_NOT_FOUND');
  });

  it('storage lỗi khi xoá object → 204, DB mất, log storage.orphan', async () => {
    const before = await row();
    ctx.storage.failDelete = 1;
    expect((await alice.agent.delete(`/api/documents/${doc.id}`).set(CSRF)).status).toBe(204);
    expect(await ctx.prisma.document.count()).toBe(0);
    expect(await objectExists(ctx.s3, before.storageKey)).toBe(true);
    expect((await request(ctx.app).get('/api/documents')).body.data.totalItems).toBe(0);
    const logs = ctx.logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(logs).toContainEqual(expect.objectContaining({ level: 40, event: 'storage.orphan', storageKey: before.storageKey }));
  });

  it('DocumentService.delete với bản chụp cũ (thay tệp xen giữa) → xoá đúng key hiện hành', async () => {
    const stale = await ctx.services.documents.findById(doc.id);
    expect((await replace(pdfBuffer('moi'), 'moi.pdf')).status).toBe(200);
    const current = await row();
    await ctx.services.documentService.delete(stale!);
    expect(await ctx.prisma.document.count()).toBe(0);
    expect(await objectExists(ctx.s3, current.storageKey)).toBe(false);
  });
});
