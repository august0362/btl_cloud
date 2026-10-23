import { readdir } from 'node:fs/promises';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '../../src/modules/files/file-types.js';
import { expectDocument, expectError } from '../helpers/contract.js';
import { docxBuffer, pdfBuffer, pdfOfSize, plainZipBuffer, pptxBuffer, sha256, textBuffer } from '../helpers/fixtures.js';
import {
  CSRF,
  createTestContext,
  objectExists,
  readObject,
  registerUser,
  resetDatabase,
  uploadDocument,
  uploadRequest,
  type TestContext,
  type TestUser,
} from './context.js';

let ctx: TestContext;
let user: TestUser;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  ctx.storage.reset();
  await resetDatabase(ctx.prisma);
  user = await registerUser(ctx.app);
});

async function counts() {
  return { documents: await ctx.prisma.document.count() };
}

async function tmpFiles(): Promise<string[]> {
  return readdir(ctx.config.upload.tmpDir);
}

describe('API-10 tải lên thành công (FR-04, FR-05, SEQ-02)', () => {
  it('AC-04.1: PDF, DOCX, PPTX → 201, DocumentDto đúng, Location, object tồn tại, không còn task', async () => {
    const cases = [
      { file: pdfBuffer(), filename: 'a.pdf', type: 'PDF' },
      { file: await docxBuffer(), filename: 'b.docx', type: 'DOCX' },
      { file: await pptxBuffer(), filename: 'c.pptx', type: 'PPTX' },
    ];
    for (const c of cases) {
      const res = await uploadRequest(user, { title: `Tài liệu ${c.type}`, visibility: 'PRIVATE', file: c.file, filename: c.filename });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const dto = expectDocument(res.body.data);
      expect(dto).toMatchObject({ fileType: c.type, visibility: 'PRIVATE', fileVersion: 1, isOwner: true, sizeBytes: c.file.length, description: null });
      expect(res.headers.location).toBe(`/api/documents/${dto.id}`);
      const row = await ctx.prisma.document.findUniqueOrThrow({ where: { id: dto.id } });
      expect(row.storageKey).toMatch(new RegExp(`^documents/${dto.id}/[0-9a-f-]{36}\\.${c.filename.split('.')[1]}$`));
      expect(sha256(await readObject(ctx.s3, row.storageKey))).toBe(sha256(c.file));
    }
    expect(await tmpFiles()).toEqual([]);
  });

  it('AC-04.5: tên tệp tiếng Việt được giữ nguyên; MIME lấy theo nội dung, bỏ qua MIME client', async () => {
    const res = await uploadRequest(user, {
      title: 'Đề cương',
      visibility: 'PUBLIC',
      filename: 'Đề cương Giải tích 1.pdf',
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.originalFilename).toBe('Đề cương Giải tích 1.pdf');
    const row = await ctx.prisma.document.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.mimeType).toBe('application/pdf');
  });

  it('AC-04.2: đúng 52 428 800 byte được chấp nhận', async () => {
    const res = await uploadRequest(user, { title: 'Tối đa', visibility: 'PUBLIC', file: pdfOfSize(MAX_UPLOAD_BYTES), filename: 'max.pdf' });
    expect(res.status).toBe(201);
    expect(res.body.data.sizeBytes).toBe(MAX_UPLOAD_BYTES);
  });

  it('trùng tên tệp → hai tài liệu độc lập, object key khác nhau', async () => {
    const a = await uploadDocument(user, { filename: 'bai-giang.pdf', file: pdfBuffer('a') });
    const b = await uploadDocument(user, { filename: 'bai-giang.pdf', file: pdfBuffer('b') });
    expect(a.id).not.toBe(b.id);
    const rows = await ctx.prisma.document.findMany({ select: { storageKey: true } });
    expect(new Set(rows.map((r) => r.storageKey)).size).toBe(2);
  });
});

describe('API-10 từ chối đầu vào (BR-04, BR-05)', () => {
  it('AC-05.2: thiếu visibility → 400, không có bản ghi, không có object/task', async () => {
    const res = await uploadRequest(user, { title: 'Thiếu chế độ' });
    expect(expectError(res, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['visibility:REQUIRED']);
    expect(await counts()).toEqual({ documents: 0 });
    expect(ctx.storage.putKeys).toEqual([]);
    expect(await tmpFiles()).toEqual([]);
  });

  it('thiếu tệp → file REQUIRED; không phải multipart → file REQUIRED', async () => {
    const noFile = await user.agent.post('/api/documents').set(CSRF).field('title', 'A').field('visibility', 'PUBLIC');
    expect(expectError(noFile, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['file:REQUIRED']);
    const json = await user.agent.post('/api/documents').set(CSRF).send({ title: 'A', visibility: 'PUBLIC' });
    expect(expectError(json, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['file:REQUIRED']);
  });

  it('AC-04.3: tệp văn bản đổi đuôi .pdf, ZIP thường đổi đuôi .docx → 415; tệp rỗng → EMPTY_FILE', async () => {
    expectError(await uploadRequest(user, { title: 'A', visibility: 'PUBLIC', file: textBuffer(), filename: 'gia.pdf' }), 415, 'UNSUPPORTED_FILE_TYPE');
    expectError(await uploadRequest(user, { title: 'A', visibility: 'PUBLIC', file: await plainZipBuffer(), filename: 'gia.docx' }), 415, 'UNSUPPORTED_FILE_TYPE');
    const empty = await uploadRequest(user, { title: 'A', visibility: 'PUBLIC', file: Buffer.alloc(0), filename: 'rong.pdf' });
    expect(expectError(empty, 400, 'VALIDATION_ERROR').map((d) => d.issue)).toEqual(['EMPTY_FILE']);
    expect(await counts()).toEqual({ documents: 0 });
    expect(await tmpFiles()).toEqual([]);
  });

  it('AC-04.2: 52 428 801 byte → 413 FILE_TOO_LARGE, không lưu gì', async () => {
    const res = await uploadRequest(user, { title: 'Quá lớn', visibility: 'PUBLIC', file: pdfOfSize(MAX_UPLOAD_BYTES + 1), filename: 'big.pdf' });
    expectError(res, 413, 'FILE_TOO_LARGE');
    expect(await counts()).toEqual({ documents: 0 });
    expect(ctx.storage.putKeys).toEqual([]);
    expect(await tmpFiles()).toEqual([]);
  });

  it('part văn bản lạ → UNKNOWN_FIELD', async () => {
    const res = await user.agent
      .post('/api/documents')
      .set(CSRF)
      .field('title', 'A')
      .field('visibility', 'PUBLIC')
      .field('ownerId', 'someone-else')
      .attach('file', pdfBuffer(), 'a.pdf');
    expect(expectError(res, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['ownerId:UNKNOWN_FIELD']);
  });

  it('Guest tải lên → 401 và server không ghi tệp tạm', async () => {
    const res = await request(ctx.app).post('/api/documents').set(CSRF).field('title', 'A').field('visibility', 'PUBLIC').attach('file', pdfBuffer(), 'a.pdf');
    expectError(res, 401, 'UNAUTHENTICATED');
    expect(await tmpFiles()).toEqual([]);
  });
});

describe('API-10 lỗi hạ tầng không bao giờ tạo tài liệu "ma" (BR-06, SEQ-03, AC-04.4)', () => {
  it('PutObject lỗi → 503 STORAGE_UNAVAILABLE, không bản ghi, không có tài liệu mới', async () => {
    ctx.storage.failPut = 1;
    const res = await uploadRequest(user, { title: 'Storage chết', visibility: 'PUBLIC' });
    expectError(res, 503, 'STORAGE_UNAVAILABLE');
    expect(await counts()).toEqual({ documents: 0 });
    const search = await request(ctx.app).get('/api/documents');
    expect(search.body.data.totalItems).toBe(0);
    expect(await tmpFiles()).toEqual([]);
  });

  it('DB lỗi sau khi PutObject thành công → 500, không bản ghi, object bị xoá bù trừ', async () => {
    // Xoá user ngay sau PutObject → INSERT documents vi phạm FK → transaction rollback.
    ctx.storage.afterPut = async () => {
      await ctx.prisma.$executeRaw`DELETE FROM users WHERE id = ${user.id}`;
    };
    const res = await uploadRequest(user, { title: 'DB lỗi', visibility: 'PUBLIC' });
    expectError(res, 500, 'INTERNAL_ERROR');
    const key = ctx.storage.putKeys[0] as string;
    expect(key).toBeDefined();
    expect(await objectExists(ctx.s3, key)).toBe(false);
    expect(await counts()).toEqual({ documents: 0 });
  });

});
