import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectDocument, expectError } from '../helpers/contract.js';
import { pdfBuffer, sha256 } from '../helpers/fixtures.js';
import {
  binaryParser,
  CSRF,
  createTestContext,
  registerUser,
  resetDatabase,
  uploadDocument,
  type TestContext,
  type TestUser,
} from './context.js';

let ctx: TestContext;
let alice: TestUser;
let bob: TestUser;
let publicDoc: { id: string };
let privateDoc: { id: string };
const privateBytes = pdfBuffer('noi dung rieng tu cua alice');

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  ctx.storage.reset();
  await resetDatabase(ctx.prisma);
  alice = await registerUser(ctx.app, 'Alice');
  bob = await registerUser(ctx.app, 'Bob');
  publicDoc = await uploadDocument(alice, { title: 'Công khai', visibility: 'PUBLIC', filename: 'Đề cương Giải tích 1.pdf' });
  privateDoc = await uploadDocument(alice, { title: 'Riêng tư', visibility: 'PRIVATE', file: privateBytes, filename: 'rieng.pdf' });
});

const guest = () => request(ctx.app);

describe('API-09 chi tiết (FR-02, UC-05)', () => {
  it('AC-02.4: Guest xem Public → 200 isOwner false; Private → 404', async () => {
    const res = await guest().get(`/api/documents/${publicDoc.id}`);
    expect(res.status).toBe(200);
    expect(expectDocument(res.body.data)).toMatchObject({ id: publicDoc.id, isOwner: false });
    expectError(await guest().get(`/api/documents/${privateDoc.id}`), 404, 'DOCUMENT_NOT_FOUND');
  });

  it('owner xem Private → 200; User khác xem Private → 404 (SEQ-06); id sai định dạng / không tồn tại → 404', async () => {
    expect((await alice.agent.get(`/api/documents/${privateDoc.id}`)).body.data).toMatchObject({ isOwner: true });
    expectError(await bob.agent.get(`/api/documents/${privateDoc.id}`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await guest().get('/api/documents/khong-phai-uuid'), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await guest().get('/api/documents/3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12'), 404, 'DOCUMENT_NOT_FOUND');
  });
});

describe('API-13 tải xuống (FR-03, SEQ-05)', () => {
  it('AC-03.2: Guest → 401 cho cả Public lẫn Private (không lộ sự tồn tại)', async () => {
    expectError(await guest().get(`/api/documents/${publicDoc.id}/download`), 401, 'UNAUTHENTICATED');
    expectError(await guest().get(`/api/documents/${privateDoc.id}/download`), 401, 'UNAUTHENTICATED');
  });

  it('AC-03.3: owner tải Private → byte trùng khớp, đủ header §A7.7', async () => {
    const res = await alice.agent.get(`/api/documents/${privateDoc.id}/download`).buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(sha256(res.body as Buffer)).toBe(sha256(privateBytes));
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe(String(privateBytes.length));
    expect(res.headers['content-disposition']).toBe(`attachment; filename="rieng.pdf"; filename*=UTF-8''rieng.pdf`);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('User khác tải Public → 200 với tên tiếng Việt; tải Private của người khác → 404 (AC-03.4)', async () => {
    const ok = await bob.agent.get(`/api/documents/${publicDoc.id}/download`).buffer(true).parse(binaryParser);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain("filename*=UTF-8''%C4%90%E1%BB%81%20c%C6%B0%C6%A1ng");
    expectError(await bob.agent.get(`/api/documents/${privateDoc.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
  });

  it('storage lỗi trước khi stream → 503 JSON; object mất → 503 và log download.object_missing', async () => {
    ctx.storage.failGet = 1;
    expectError(await alice.agent.get(`/api/documents/${privateDoc.id}/download`), 503, 'STORAGE_UNAVAILABLE');
    const row = await ctx.prisma.document.findUniqueOrThrow({ where: { id: privateDoc.id } });
    await ctx.s3.deleteObject(row.storageKey);
    expectError(await alice.agent.get(`/api/documents/${privateDoc.id}/download`), 503, 'STORAGE_UNAVAILABLE');
  });
});

describe('API-11 sửa metadata / chế độ hiển thị (FR-07, UC-09, UC-10)', () => {
  it('AC-07.1: owner sửa một phần → 200; fileVersion và tệp giữ nguyên; tìm theo tiêu đề mới thấy', async () => {
    const before = await ctx.prisma.document.findUniqueOrThrow({ where: { id: publicDoc.id } });
    const res = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: '  Tiêu đề mới  ', description: 'Mô tả mới' });
    expect(res.status).toBe(200);
    const dto = expectDocument(res.body.data);
    expect(dto).toMatchObject({ title: 'Tiêu đề mới', description: 'Mô tả mới', visibility: 'PUBLIC', fileVersion: 1 });
    expect(new Date(dto.updatedAt).getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    const after = await ctx.prisma.document.findUniqueOrThrow({ where: { id: publicDoc.id } });
    expect(after.storageKey).toBe(before.storageKey);
    expect((await guest().get('/api/documents?q=tiêu đề mới')).body.data.totalItems).toBe(1);
  });

  it('description null → xoá mô tả; {} → NO_CHANGES; title null → INVALID_TYPE; trường lạ → UNKNOWN_FIELD', async () => {
    await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ description: 'có' });
    const cleared = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ description: null });
    expect(cleared.body.data.description).toBeNull();
    expect(expectError(await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({}), 400, 'VALIDATION_ERROR')).toEqual([
      { field: 'body', issue: 'NO_CHANGES', message: 'Cần gửi ít nhất một trường để cập nhật.' },
    ]);
    const nullTitle = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: null });
    expect(expectError(nullTitle, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['title:INVALID_TYPE']);
    const unknown = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ ownerId: bob.id });
    // Chỉ có trường lạ → không còn trường hợp lệ nào nên báo cả UNKNOWN_FIELD lẫn NO_CHANGES.
    expect(expectError(unknown, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['ownerId:UNKNOWN_FIELD', 'body:NO_CHANGES']);
    const mixed = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: 'Hợp lệ', ownerId: bob.id });
    expect(expectError(mixed, 400, 'VALIDATION_ERROR').map((d) => `${d.field}:${d.issue}`)).toEqual(['ownerId:UNKNOWN_FIELD']);
  });

  it('AC-07.2: Public → Private biến mất khỏi tìm kiếm ngay, User khác tải → 404', async () => {
    const res = await alice.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ visibility: 'PRIVATE' });
    expect(res.body.data.visibility).toBe('PRIVATE');
    expect((await guest().get('/api/documents')).body.data.totalItems).toBe(0);
    expectError(await bob.agent.get(`/api/documents/${publicDoc.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
  });

  it('AC-07.3: User khác sửa Public → 403 FORBIDDEN; Private → 404; Guest → 401; thiếu CSRF → 403', async () => {
    expectError(await bob.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: 'X' }), 403, 'FORBIDDEN');
    expectError(await bob.agent.patch(`/api/documents/${privateDoc.id}`).set(CSRF).send({ title: 'X' }), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await guest().patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: 'X' }), 401, 'UNAUTHENTICATED');
    expectError(await alice.agent.patch(`/api/documents/${publicDoc.id}`).send({ title: 'X' }), 403, 'CSRF_REJECTED');
    const row = await ctx.prisma.document.findUniqueOrThrow({ where: { id: publicDoc.id } });
    expect(row.title).toBe('Công khai');
  });
});

describe('Kiểm quyền trước khi đọc body (M2-05, §A3.8)', () => {
  it('User khác PUT /file với tệp 10 MB → 403 và server không ghi tệp tạm', async () => {
    const { readdir } = await import('node:fs/promises');
    const { pdfOfSize } = await import('../helpers/fixtures.js');
    const before = await readdir(ctx.config.upload.tmpDir);
    let status: number | undefined;
    try {
      const res = await bob.agent.put(`/api/documents/${publicDoc.id}/file`).set(CSRF).attach('file', pdfOfSize(10 * 1024 * 1024), 'lon.pdf');
      status = res.status;
      expectError(res, 403, 'FORBIDDEN');
    } catch (error) {
      // Server trả lỗi sớm kèm Connection: close (§A7.7 API-12) — client có thể thấy kết nối bị đóng khi đang gửi.
      const code = (error as { code?: string }).code;
      if (status !== undefined || !['ECONNRESET', 'EPIPE'].includes(code ?? '')) throw error;
    }
    console.info(`[M2-05] PUT 10 MB bởi non-owner → ${status ?? 'kết nối bị đóng sớm'}`);
    expect(await readdir(ctx.config.upload.tmpDir)).toEqual(before);
    expect((await ctx.prisma.document.findUniqueOrThrow({ where: { id: publicDoc.id } })).fileVersion).toBe(1);
  });
});

describe('Ma trận quyền quản lý (CONTEXT §C3.2) cho thay tệp và xoá', () => {
  it('User khác: thay/xoá Public → 403, Private → 404; Guest → 401; dữ liệu không đổi', async () => {
    const replace = (agent: request.Agent | ReturnType<typeof guest>, id: string) =>
      agent.put(`/api/documents/${id}/file`).set(CSRF).attach('file', pdfBuffer('x'), 'x.pdf');
    expectError(await replace(bob.agent, publicDoc.id), 403, 'FORBIDDEN');
    expectError(await replace(bob.agent, privateDoc.id), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await replace(guest(), publicDoc.id), 401, 'UNAUTHENTICATED');
    expectError(await bob.agent.delete(`/api/documents/${publicDoc.id}`).set(CSRF), 403, 'FORBIDDEN');
    expectError(await bob.agent.delete(`/api/documents/${privateDoc.id}`).set(CSRF), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await guest().delete(`/api/documents/${publicDoc.id}`).set(CSRF), 401, 'UNAUTHENTICATED');
    expect(await ctx.prisma.document.count()).toBe(2);
    expect(await ctx.prisma.document.count({ where: { fileVersion: 1 } })).toBe(2);
  });
});
