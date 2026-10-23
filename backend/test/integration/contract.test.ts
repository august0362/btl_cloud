import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectDocument, expectError, pageSchema, userDtoSchema } from '../helpers/contract.js';
import { pdfBuffer, sha256 } from '../helpers/fixtures.js';
import { binaryParser, CSRF, createTestContext, resetDatabase, uniqueEmail, type TestContext } from './context.js';

/**
 * M2-15: kiểm tra hình dạng response của đủ 14 endpoint theo ARCHITECTURE §A7 bằng schema `.strict()`
 * (thiếu trường hoặc thừa trường đều fail). Đồng thời kiểm tra log không lộ bí mật (M2-14).
 */
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ LOG_LEVEL: 'info' });
  await resetDatabase(ctx.prisma);
});
afterAll(async () => {
  await ctx.close();
});

describe('Hợp đồng API-01 … API-14', () => {
  it('đi hết vòng đời một tài liệu và kiểm từng response', async () => {
    const covered = new Set<string>();
    const agent = request.agent(ctx.app);
    const password = 'mat-khau-rat-bi-mat-123';

    const health = await agent.get('/api/health');
    expect(Object.keys(health.body.data).sort()).toEqual(['instanceId', 'status', 'uptimeSeconds', 'version']);
    covered.add('API-01');

    const ready = await agent.get('/api/health/ready');
    expect(ready.body).toEqual({ data: { status: 'ready', instanceId: 'test-instance', checks: { database: 'ok', storage: 'ok' } } });
    covered.add('API-02');

    expect((await agent.get('/api/auth/me')).body).toEqual({ data: { user: null } });
    covered.add('API-03');

    const email = uniqueEmail('contract');
    const register = await agent.post('/api/auth/register').set(CSRF).send({ email, password, displayName: 'Hợp Đồng' });
    expect(register.status).toBe(201);
    expect(Object.keys(register.body)).toEqual(['data']);
    expect(Object.keys(register.body.data)).toEqual(['user']);
    userDtoSchema.parse(register.body.data.user);
    covered.add('API-04');

    const login = await agent.post('/api/auth/login').set(CSRF).send({ email, password });
    userDtoSchema.parse(login.body.data.user);
    covered.add('API-05');
    userDtoSchema.parse((await agent.get('/api/auth/me')).body.data.user);

    const file = pdfBuffer('hop dong');
    const created = await agent
      .post('/api/documents')
      .set(CSRF)
      .field('title', 'Tài liệu hợp đồng')
      .field('visibility', 'PUBLIC')
      .attach('file', file, 'hop-dong.pdf');
    expect(created.status).toBe(201);
    const dto = expectDocument(created.body.data);
    covered.add('API-10');

    pageSchema.parse((await agent.get('/api/documents')).body.data);
    covered.add('API-07');
    pageSchema.parse((await agent.get('/api/documents/mine')).body.data);
    covered.add('API-08');
    expectDocument((await request(ctx.app).get(`/api/documents/${dto.id}`)).body.data);
    covered.add('API-09');

    expectDocument((await agent.patch(`/api/documents/${dto.id}`).set(CSRF).send({ description: 'Mới' })).body.data);
    covered.add('API-11');

    const replaced = await agent.put(`/api/documents/${dto.id}/file`).set(CSRF).attach('file', pdfBuffer('moi'), 'moi.pdf');
    expect(expectDocument(replaced.body.data).fileVersion).toBe(2);
    covered.add('API-12');

    const download = await agent.get(`/api/documents/${dto.id}/download`).buffer(true).parse(binaryParser);
    expect(download.status).toBe(200);
    expect(sha256(download.body as Buffer)).toBe(sha256(pdfBuffer('moi')));
    covered.add('API-13');

    const removed = await agent.delete(`/api/documents/${dto.id}`).set(CSRF);
    expect(removed.status).toBe(204);
    covered.add('API-14');

    const logout = await agent.post('/api/auth/logout').set(CSRF);
    expect(logout.status).toBe(204);
    covered.add('API-06');

    expect([...covered].sort()).toEqual(Array.from({ length: 14 }, (_, i) => `API-${String(i + 1).padStart(2, '0')}`));

    // M2-14: log có trường bắt buộc và không lộ mật khẩu, cookie, Set-Cookie.
    const logText = ctx.logs.join('');
    expect(logText).not.toContain(password);
    const sessionValue = String(login.headers['set-cookie']).split(';')[0]!.slice('sid='.length);
    expect(sessionValue.length).toBe(43);
    expect(logText).not.toContain(sessionValue);
    const requestLogs = ctx.logs.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.req && entry.res);
    expect(requestLogs.length).toBeGreaterThan(10);
    const sample = requestLogs.find((entry) => (entry.req as { url: string }).url === '/api/documents/mine') as Record<string, unknown>;
    expect(sample).toMatchObject({
      instanceId: 'test-instance',
      durationMs: expect.any(Number),
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      userId: register.body.data.user.id,
    });
    expect((sample.req as { id: string; method: string }).method).toBe('GET');
    expect((sample.req as { id: string }).id).toBe(sample.requestId);
    expect((sample.res as { statusCode: number }).statusCode).toBe(200);
  });

  it('mọi lỗi dùng chung envelope với details là mảng và requestId', async () => {
    expectError(await request(ctx.app).get('/api/khong-co'), 404, 'ROUTE_NOT_FOUND');
    expectError(await request(ctx.app).post('/api/auth/login').send({}), 403, 'CSRF_REJECTED');
    expectError(await request(ctx.app).get('/api/documents/mine'), 401, 'UNAUTHENTICATED');
    expectError(await request(ctx.app).get('/api/documents?page=0'), 400, 'VALIDATION_ERROR');
  });
});
