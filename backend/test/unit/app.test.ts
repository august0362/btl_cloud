import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createServices } from '../../src/container.js';
import { createLogger } from '../../src/lib/logger.js';
import { InMemoryObjectStorage } from '../../src/storage/in-memory-object-storage.js';
import { testConfig } from '../helpers/config.js';
import { expectError } from '../helpers/contract.js';

/**
 * Kiểm tra pipeline HTTP không cần MySQL/S3 (M1-07, M1-08, M1-09, M2-02, M2-14 phần không cần DB).
 * PrismaClient giả: chỉ $queryRaw được dùng (readiness); các model không bao giờ được gọi trong các test này.
 */
function buildApp(overrides: Record<string, string> = {}, prismaImpl: Partial<PrismaClient> = {}) {
  const config = testConfig(overrides);
  const logger = createLogger({ level: 'silent', instanceId: config.instanceId });
  const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]), ...prismaImpl } as unknown as PrismaClient;
  const storage = new InMemoryObjectStorage();
  const services = createServices({ config, logger, prisma, storage });
  return { app: createApp({ config, logger, prisma, storage, services }), storage, prisma };
}

describe('Envelope lỗi và header chung (§A7.1–§A7.3)', () => {
  it('đường dẫn /api lạ → 404 ROUTE_NOT_FOUND, details [] và requestId trùng header', async () => {
    const res = await request(buildApp().app).get('/api/khong-co');
    expect(expectError(res, 404, 'ROUTE_NOT_FOUND')).toEqual([]);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('JSON hỏng → 400 INVALID_JSON; body > 16 KB → 413 PAYLOAD_TOO_LARGE', async () => {
    const { app } = buildApp();
    const bad = await request(app).post('/api/auth/login').set('X-CSRF-Protection', '1').set('Content-Type', 'application/json').send('{"email":');
    expectError(bad, 400, 'INVALID_JSON');
    const big = await request(app)
      .post('/api/auth/login')
      .set('X-CSRF-Protection', '1')
      .send({ email: 'a@b.co', password: 'x'.repeat(17 * 1024) });
    expectError(big, 413, 'PAYLOAD_TOO_LARGE');
  });

  it('có CSP, nosniff, frame-ancestors none, Referrer-Policy no-referrer; không có HSTS khi tắt', async () => {
    const res = await request(buildApp().app).get('/api/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    const hsts = await request(buildApp({ HSTS_ENABLED: 'true' }).app).get('/api/health');
    expect(hsts.headers['strict-transport-security']).toContain('max-age=');
  });

  it('lỗi không lường trước → 500 INTERNAL_ERROR, không lộ stack', async () => {
    const { app } = buildApp({}, { $queryRaw: vi.fn().mockRejectedValue(new Error('boom: secret stack')) } as Partial<PrismaClient>);
    // GET /api/documents hợp lệ → repository gọi $queryRaw → lỗi
    const res = await request(app).get('/api/documents');
    expectError(res, 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('boom');
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });
});

describe('CSRF (M2-02, §A5.4)', () => {
  it('POST thiếu X-CSRF-Protection → 403 CSRF_REJECTED', async () => {
    expectError(await request(buildApp().app).post('/api/auth/logout'), 403, 'CSRF_REJECTED');
  });
  it('header sai giá trị hoặc Origin lạ → 403', async () => {
    const { app } = buildApp();
    expectError(await request(app).post('/api/auth/logout').set('X-CSRF-Protection', 'true'), 403, 'CSRF_REJECTED');
    expectError(
      await request(app).post('/api/auth/logout').set('X-CSRF-Protection', '1').set('Origin', 'http://evil.example'),
      403,
      'CSRF_REJECTED',
    );
  });
  it('Origin hợp lệ hoặc không có Origin + header đúng → qua; GET không cần header', async () => {
    const { app } = buildApp();
    expect((await request(app).post('/api/auth/logout').set('X-CSRF-Protection', '1').set('Origin', 'http://localhost:5173')).status).toBe(204);
    expect((await request(app).post('/api/auth/logout').set('X-CSRF-Protection', '1')).status).toBe(204);
    expect((await request(app).get('/api/auth/me')).status).toBe(200);
  });
  it('multipart bị từ chối trước khi đọc body vẫn trả JSON đúng', async () => {
    const res = await request(buildApp().app).post('/api/documents').attach('file', Buffer.from('%PDF-1.4'), 'a.pdf');
    expectError(res, 403, 'CSRF_REJECTED');
  });
});

describe('Xác thực ở mức HTTP không cần DB', () => {
  it('API-03 không cookie → 200 user null (không bao giờ 401)', async () => {
    const res = await request(buildApp().app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { user: null } });
  });
  it('route cần đăng nhập → 401 UNAUTHENTICATED', async () => {
    const { app } = buildApp();
    expectError(await request(app).get('/api/documents/mine'), 401, 'UNAUTHENTICATED');
    expectError(await request(app).post('/api/documents').set('X-CSRF-Protection', '1'), 401, 'UNAUTHENTICATED');
    expectError(await request(app).get('/api/documents/3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12/download'), 401, 'UNAUTHENTICATED');
  });
  it('API-06 không cookie → 204 và xoá cookie (Max-Age=0)', async () => {
    const res = await request(buildApp().app).post('/api/auth/logout').set('X-CSRF-Protection', '1');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/sid=; Max-Age=0; Path=\/;.*HttpOnly.*SameSite=Lax/);
  });
  it('API-07 tham số sai → 400 VALIDATION_ERROR trước khi chạm DB', async () => {
    const res = await request(buildApp().app).get('/api/documents?page=abc&sort=oldest');
    const details = expectError(res, 400, 'VALIDATION_ERROR');
    expect(details.map((d) => `${d.field}:${d.issue}`)).toEqual(['sort:INVALID_ENUM', 'page:INVALID_TYPE']);
  });
  it('API-04 dữ liệu sai → 400 với details theo trường', async () => {
    const res = await request(buildApp().app).post('/api/auth/register').set('X-CSRF-Protection', '1').send({ email: 'x', password: 'ngan' });
    const details = expectError(res, 400, 'VALIDATION_ERROR');
    expect(details.map((d) => d.field)).toEqual(['email', 'password', 'displayName']);
  });
});

describe('Rate limit API-04/05 (M2-04, §A5.6)', () => {
  it('vượt ngưỡng → 429 RATE_LIMITED kèm Retry-After', async () => {
    const { app } = buildApp({ AUTH_RATE_LIMIT_MAX: '2' });
    const send = () => request(app).post('/api/auth/register').set('X-CSRF-Protection', '1').send({});
    expect((await send()).status).toBe(400);
    expect((await send()).status).toBe(400);
    const limited = await send();
    expectError(limited, 429, 'RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('login chỉ đếm lần thất bại', async () => {
    const { app } = buildApp({ AUTH_RATE_LIMIT_MAX: '1' });
    const send = () => request(app).post('/api/auth/login').set('X-CSRF-Protection', '1').send({});
    expect((await send()).status).toBe(400);
    expectError(await send(), 429, 'RATE_LIMITED');
  });
});

describe('Health (M1-08, API-01/02)', () => {
  it('API-01 đủ 4 trường và không chạm DB', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('DB down'));
    const { app } = buildApp({}, { $queryRaw: queryRaw } as Partial<PrismaClient>);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', instanceId: 'test-instance', version: '1.0.0', uptimeSeconds: expect.any(Number) } });
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('API-02 sẵn sàng → 200 checks ok', async () => {
    const res = await request(buildApp().app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ready', instanceId: 'test-instance', checks: { database: 'ok', storage: 'ok' } } });
  });
  it('API-02 DB lỗi → 503 SERVICE_UNAVAILABLE với details database', async () => {
    const { app } = buildApp({}, { $queryRaw: vi.fn().mockRejectedValue(new Error('down')) } as Partial<PrismaClient>);
    const details = expectError(await request(app).get('/api/health/ready'), 503, 'SERVICE_UNAVAILABLE');
    expect(details).toEqual([{ field: 'database', issue: 'UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu.' }]);
  });
  it('API-02 storage lỗi → 503 với details storage', async () => {
    const { app, storage } = buildApp();
    storage.failNext('health');
    const details = expectError(await request(app).get('/api/health/ready'), 503, 'SERVICE_UNAVAILABLE');
    expect(details.map((d) => d.field)).toEqual(['storage']);
  });
});

describe('Phục vụ SPA cùng origin (M1-09, §A3.7)', () => {
  async function distDir() {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'btl-dist-'));
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>SPA</title>');
    await writeFile(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    return dir;
  }

  it('index, asset immutable, SPA fallback, /api lạ vẫn trả JSON 404', async () => {
    const { app } = buildApp({ SERVE_FRONTEND: 'true', FRONTEND_DIST_DIR: await distDir() });
    const home = await request(app).get('/').set('Accept', 'text/html');
    expect(home.status).toBe(200);
    expect(home.text).toContain('SPA');
    expect(home.headers['cache-control']).toBe('no-cache');

    const asset = await request(app).get('/assets/app-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const deep = await request(app).get('/me/documents').set('Accept', 'text/html,application/xhtml+xml');
    expect(deep.status).toBe(200);
    expect(deep.text).toContain('SPA');

    expectError(await request(app).get('/api/khong-co').set('Accept', 'text/html'), 404, 'ROUTE_NOT_FOUND');
    expect((await request(app).get('/khong-co.png').set('Accept', 'image/png')).status).toBe(404);
  });

  it('SERVE_FRONTEND=false → chỉ phục vụ API', async () => {
    const res = await request(buildApp().app).get('/').set('Accept', 'text/html');
    expect(res.status).toBe(404);
  });
});
