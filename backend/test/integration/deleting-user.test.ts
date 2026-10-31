import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectError } from '../helpers/contract.js';
import { CSRF, createTestContext, registerUser, resetDatabase, uploadDocument, type TestContext, type TestUser } from './context.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.prisma);
});

async function markDeleting(user: TestUser): Promise<void> {
  await ctx.prisma.$executeRaw`UPDATE users SET deletion_started_at = NOW(3) WHERE id = ${user.id}`;
}

function searchTitles(res: request.Response): string[] {
  return (res.body.data.items as Array<{ title: string }>).map((item) => item.title);
}

describe('XM-04 user DELETING coi như không tồn tại (E2-01, XBR-06)', () => {
  it('migration: users.deletion_started_at DATETIME(3) NULL', async () => {
    const columns = await ctx.prisma.$queryRaw<Array<{ Field: string; Type: string; Null: string }>>`DESCRIBE users`;
    expect(columns.find((c) => c.Field === 'deletion_started_at')).toMatchObject({ Type: 'datetime(3)', Null: 'YES' });
  });

  it('đăng nhập → 401 INVALID_CREDENTIALS giống email không tồn tại, không cấp cookie', async () => {
    const a = await registerUser(ctx.app);
    await markDeleting(a);
    const res = await request(ctx.app).post('/api/auth/login').set(CSRF).send({ email: a.email, password: 'matkhau123' });
    expectError(res, 401, 'INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
    const unknown = await request(ctx.app).post('/api/auth/login').set(CSRF).send({ email: 'khong-ton-tai@example.com', password: 'matkhau123' });
    const strip = (body: { error: Record<string, unknown> }) => ({ ...body.error, requestId: undefined });
    expect(strip(res.body)).toEqual(strip(unknown.body));
  });

  it('phiên đang có không còn hợp lệ: API-03 user null, API-08 401 UNAUTHENTICATED, cookie bị xoá', async () => {
    const a = await registerUser(ctx.app);
    await markDeleting(a);
    const me = await a.agent.get('/api/auth/me');
    expect(me.body).toEqual({ data: { user: null } });
    expect(String(me.headers['set-cookie'])).toContain('sid=; Max-Age=0');
    const fresh = await registerUser(ctx.app);
    await markDeleting(fresh);
    expectError(await fresh.agent.get('/api/documents/mine'), 401, 'UNAUTHENTICATED');
  });

  it('tài liệu của user DELETING → 404 với Guest và user khác (xem, tải); không có trong tìm kiếm', async () => {
    const a = await registerUser(ctx.app, 'Chủ A');
    const b = await registerUser(ctx.app, 'Người B');
    const publicDoc = await uploadDocument(a, { title: 'Giải tích của A', visibility: 'PUBLIC' });
    await uploadDocument(a, { title: 'Giải tích riêng của A', visibility: 'PRIVATE' });
    await uploadDocument(b, { title: 'Giải tích của B', visibility: 'PUBLIC' });

    const before = await request(ctx.app).get('/api/documents').query({ q: 'Giải tích' });
    expect(searchTitles(before).sort()).toEqual(['Giải tích của A', 'Giải tích của B']);

    await markDeleting(a);

    expectError(await request(ctx.app).get(`/api/documents/${publicDoc.id}`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await b.agent.get(`/api/documents/${publicDoc.id}`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await b.agent.get(`/api/documents/${publicDoc.id}/download`), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await b.agent.patch(`/api/documents/${publicDoc.id}`).set(CSRF).send({ title: 'Đổi' }), 404, 'DOCUMENT_NOT_FOUND');
    expectError(await b.agent.delete(`/api/documents/${publicDoc.id}`).set(CSRF), 404, 'DOCUMENT_NOT_FOUND');

    const after = await request(ctx.app).get('/api/documents').query({ q: 'Giải tích' });
    expect(searchTitles(after)).toEqual(['Giải tích của B']);
    expect(after.body.data.totalItems).toBe(1);
    const all = await request(ctx.app).get('/api/documents');
    expect(searchTitles(all)).toEqual(['Giải tích của B']);

    // Không đổi dữ liệu: bản ghi vẫn còn cho bước xoá của admin (E2-03).
    expect(await ctx.prisma.document.count({ where: { ownerId: a.id } })).toBe(2);
  });
});
