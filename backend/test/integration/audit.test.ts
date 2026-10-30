import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditAction } from '../../src/modules/audit/audit.recorder.js';
import { createAudited } from '../../src/modules/audit/audited.js';
import { TEST_ENV } from '../helpers/config.js';
import { CSRF, createTestContext, registerUser, resetDatabase, uploadRequest, type TestContext, type TestUser } from './context.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ LOG_LEVEL: 'error' });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.prisma);
  await ctx.prisma.$executeRawUnsafe('DELETE FROM audit_events');
  ctx.logs.length = 0;
});

/**
 * E7-01 chưa gắn audited() vào route nào (việc của E7-02) → test bọc app thật bằng một app ngoài
 * gắn audited() đúng đường dẫn; req/res đi tiếp vào app thật như khi gắn trong router.
 */
function auditedApp(method: 'post' | 'get', route: string, action: AuditAction, before: RequestHandler[] = []): Express {
  const outer = express();
  outer[method](route, ...before, createAudited(ctx.services.audit)(action));
  outer.use(ctx.app);
  return outer;
}

/** Đăng nhập qua app bọc ngoài để agent giữ cookie phiên của app đó. */
async function loginOn(app: Express, user: TestUser): Promise<TestUser> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set(CSRF).send({ email: user.email, password: 'matkhau123' });
  expect(res.status).toBe(200);
  return { ...user, agent };
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

describe('Migration audit_events (§A12.4)', () => {
  it('đúng cột, kiểu, index; id BIGINT UNSIGNED AUTO_INCREMENT; không FK', async () => {
    const columns = await ctx.prisma.$queryRaw<Array<{ Field: string; Type: string; Null: string; Key: string; Extra: string }>>`DESCRIBE audit_events`;
    expect(columns.map((c) => [c.Field, c.Type, c.Null])).toEqual([
      ['id', 'bigint unsigned', 'NO'],
      ['created_at', 'datetime(3)', 'NO'],
      ['actor_type', "enum('USER','DEVELOPER','ANONYMOUS')", 'NO'],
      ['actor_id', 'varchar(64)', 'YES'],
      ['action', 'varchar(40)', 'NO'],
      ['target_type', "enum('USER','DOCUMENT','FRIENDSHIP')", 'YES'],
      ['target_id', 'char(36)', 'YES'],
      ['outcome', "enum('SUCCESS','FAILURE')", 'NO'],
      ['error_code', 'varchar(40)', 'YES'],
      ['request_id', 'char(36)', 'YES'],
      ['metadata', 'json', 'YES'],
    ]);
    expect(columns[0]).toMatchObject({ Key: 'PRI', Extra: 'auto_increment' });

    const indexes = await ctx.prisma.$queryRaw<Array<{ Key_name: string; Column_name: string; Seq_in_index: number | bigint }>>`SHOW INDEX FROM audit_events`;
    const byName = new Map<string, string[]>();
    for (const index of [...indexes].sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))) {
      byName.set(index.Key_name, [...(byName.get(index.Key_name) ?? []), index.Column_name]);
    }
    expect(Object.fromEntries(byName)).toEqual({
      PRIMARY: ['id'],
      idx_audit_events_created_at: ['created_at'],
      idx_audit_events_actor_created: ['actor_id', 'created_at'],
      idx_audit_events_target_created: ['target_id', 'created_at'],
      idx_audit_events_request_id: ['request_id'],
    });

    const fks = await ctx.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_events' AND REFERENCED_TABLE_NAME IS NOT NULL`;
    expect(Number(fks[0]?.n)).toBe(0);
  });
});

describe('Audit recorder qua app thật (E7-01)', () => {
  it('ghi sự kiện SUCCESS với actor, requestId trùng X-Request-Id; metadata chỉ giữ khoá trong allowlist', async () => {
    const a = await registerUser(ctx.app);
    const injectMetadata: RequestHandler = (_req, res, next) => {
      res.locals.auditMetadata = { visibility: 'PUBLIC', title: 'Tiêu đề bí mật XYZ', email: a.email, originalFilename: 'bi-mat.pdf' };
      next();
    };
    const app = auditedApp('post', '/api/documents', 'DOCUMENT_UPLOAD', [injectMetadata]);
    const res = await uploadRequest(await loginOn(app, a), { title: 'Tiêu đề bí mật XYZ', visibility: 'PUBLIC' });
    expect(res.status).toBe(201);

    const rows = await waitFor(() => ctx.prisma.auditEvent.findMany(), (found) => found.length > 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: 'USER',
      actorId: a.id,
      action: 'DOCUMENT_UPLOAD',
      outcome: 'SUCCESS',
      errorCode: null,
      requestId: res.headers['x-request-id'],
      metadata: { visibility: 'PUBLIC' },
    });
    const leaked = await ctx.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM audit_events
      WHERE CAST(metadata AS CHAR) LIKE ${'%XYZ%'} OR CAST(metadata AS CHAR) LIKE ${`%${a.email}%`} OR CAST(metadata AS CHAR) LIKE ${'%bi-mat%'}`;
    expect(Number(leaked[0]?.n)).toBe(0);
  });

  it('allowlist khi ghi trực tiếp (vd. thao tác admin E2): khoá lạ bị bỏ, > 1 KB → truncated', async () => {
    ctx.services.audit.record({
      actorType: 'DEVELOPER', actorId: 'dev', action: 'ADMIN_ACCOUNT_DELETE', targetType: 'USER', targetId: '00000000-0000-4000-8000-000000000001',
      outcome: 'SUCCESS', errorCode: null, requestId: null,
      metadata: { maskedEmail: 'a***@example.com', deletedDocuments: 2, remainingDocuments: 0, email: 'a@example.com', password: 'x' },
    });
    ctx.services.audit.record({
      actorType: 'USER', actorId: 'u', action: 'DOCUMENT_UPDATE', targetType: 'DOCUMENT', targetId: '00000000-0000-4000-8000-000000000002',
      outcome: 'SUCCESS', errorCode: null, requestId: null, metadata: { fields: Array.from({ length: 200 }, (_, i) => `field-${i}`) },
    });
    // Hai lần ghi không chờ → thứ tự INSERT không cố định.
    const rows = await waitFor(() => ctx.prisma.auditEvent.findMany(), (found) => found.length === 2);
    expect(Object.fromEntries(rows.map((r) => [r.action, r.metadata]))).toEqual({
      ADMIN_ACCOUNT_DELETE: { maskedEmail: 'a***@example.com', deletedDocuments: 2, remainingDocuments: 0 },
      DOCUMENT_UPDATE: { truncated: true },
    });
  });

  it('E7-AC-04: ghi audit lỗi → upload vẫn 201, tài liệu tồn tại, log ERROR audit.write_failed kèm requestId', async () => {
    const a = await registerUser(ctx.app);
    const spy = vi.spyOn(ctx.services.auditEvents, 'insert').mockRejectedValueOnce(new Error('audit_events không ghi được'));
    try {
      const app = auditedApp('post', '/api/documents', 'DOCUMENT_UPLOAD');
      const res = await uploadRequest(await loginOn(app, a), { title: 'AC-04', visibility: 'PRIVATE' });
      expect(res.status).toBe(201);
      expect(await ctx.prisma.document.count({ where: { id: res.body.data.id } })).toBe(1);

      const requestIdHeader = res.headers['x-request-id'] as string;
      const line = await waitFor(
        async () => ctx.logs.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.event === 'audit.write_failed'),
        (found) => found !== undefined,
      );
      expect(line).toMatchObject({ level: 50, event: 'audit.write_failed', action: 'DOCUMENT_UPLOAD', requestId: requestIdHeader });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await ctx.prisma.auditEvent.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('E7-AC-05: retention lúc khởi động', () => {
  it('AUDIT_RETENTION_DAYS=1, có sự kiện 2 ngày tuổi → sau khi khởi động lại backend, sự kiện cũ bị xoá, sự kiện mới còn', async () => {
    const base = { actorType: 'ANONYMOUS', actorId: null, action: 'AUTH_LOGIN', targetType: null, targetId: null, outcome: 'FAILURE', errorCode: 'INVALID_CREDENTIALS', requestId: null, metadata: null } as const;
    await ctx.services.auditEvents.insert({ ...base, createdAt: new Date(Date.now() - 2 * DAY_MS) });
    await ctx.services.auditEvents.insert({ ...base, createdAt: new Date() });
    expect(await ctx.services.audit.purgeExpired(90)).toBe(0);
    expect(await ctx.prisma.auditEvent.count()).toBe(2);

    // Khởi động backend thật (src/server.ts) như khi restart; purge chạy trước khi listen.
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '0',
        HOST: '127.0.0.1',
        DATABASE_URL: TEST_ENV.DATABASE_URL,
        S3_BUCKET: TEST_ENV.S3_BUCKET,
        S3_ENDPOINT: TEST_ENV.S3_ENDPOINT,
        S3_REGION: TEST_ENV.S3_REGION,
        S3_FORCE_PATH_STYLE: 'true',
        AWS_ACCESS_KEY_ID: TEST_ENV.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: TEST_ENV.AWS_SECRET_ACCESS_KEY,
        UPLOAD_TMP_DIR: path.join(os.tmpdir(), 'btl-cloud-test-uploads'),
        LOG_LEVEL: 'info',
        INSTANCE_ID: 'audit-retention-restart',
        AUDIT_RETENTION_DAYS: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Backend không khởi động trong 60 s:\n${output}`)), 60_000);
        const onData = (chunk: Buffer) => {
          output += String(chunk);
          if (output.includes('"event":"server.started"')) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Backend thoát sớm (${code}):\n${output}`));
        });
      });
    } finally {
      child.removeAllListeners('exit');
      child.kill();
    }

    const rows = await ctx.prisma.auditEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(Date.now() - (rows[0]?.createdAt.getTime() ?? 0)).toBeLessThan(DAY_MS);
    expect(output).not.toContain('audit.purge_failed');
  });
});
