import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/http/errors.js';
import { apiNotFound, errorHandler } from '../../src/http/middleware/error-handler.js';
import { requestId, requestLogger } from '../../src/http/middleware/request-context.js';
import { createLogger } from '../../src/lib/logger.js';
import { moduleOf } from '../../src/lib/module-of.js';

describe('moduleOf (§A12.7)', () => {
  it.each([
    ['/api/auth/login', 'auth'], ['/api/documents?sort=title', 'documents'],
    ['/api/documents/id/download', 'documents'], ['/api/me', 'users'],
    ['/api/users/id', 'users'], ['/api/friends', 'friends'], ['/api/health/ready', 'health'],
    ['/api/authentic', 'http'], ['/api/documents-other', 'http'], ['/api/meow', 'http'], ['/', 'http'],
  ])('%s → %s', (path, module) => expect(moduleOf(path)).toBe(module));
});

describe('XM-14: dòng log kết thúc request', () => {
  it.each([
    { status: 400, path: '/api/auth/login', module: 'auth', code: 'VALIDATION_ERROR', stage: 'validate', error: new AppError('VALIDATION_ERROR', { stage: 'validate' }) },
    { status: 404, path: '/api/missing', module: 'http', code: 'ROUTE_NOT_FOUND', stage: null, error: null },
    { status: 503, path: '/api/documents', module: 'documents', code: 'STORAGE_UNAVAILABLE', stage: 'storage.put', error: new AppError('STORAGE_UNAVAILABLE', { stage: 'storage.put' }) },
    { status: 500, path: '/api/users/test', module: 'users', code: 'INTERNAL_ERROR', stage: null, error: new Error('unexpected failure') },
  ])('$status có đủ trường, giữ envelope và redact', async ({ status, path, module, code, stage, error }) => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', instanceId: 'diagnostics-test' }, { write: (line) => { lines.push(line); } });
    const app = express();
    app.use(requestId(), requestLogger(logger), express.json());
    app.post(path, (_req, res, next) => {
      res.setHeader('Set-Cookie', 'sid=response-cookie-secret');
      next(error ?? undefined);
    });
    app.use(apiNotFound, errorHandler(logger));

    const response = await request(app).post(path).set('Cookie', 'sid=request-cookie-secret')
      .set('Authorization', 'Bearer authorization-secret').send({ password: 'password-secret' });
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: {
      code, message: expect.any(String), details: [], requestId: response.headers['x-request-id'],
    } });

    const entries = lines.map((line) => JSON.parse(line));
    const completed = entries.filter((entry) => 'durationMs' in entry);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      time: expect.any(String), level: status >= 500 ? 50 : 40, instanceId: 'diagnostics-test',
      requestId: response.headers['x-request-id'], module, code, stage,
      req: { method: 'POST', url: path }, res: { statusCode: status },
      durationMs: expect.any(Number), userId: null,
    });
    if (status >= 500) expect(entries.find((entry) => !('durationMs' in entry))).toMatchObject({
      level: 50, requestId: response.headers['x-request-id'], module, code, stage,
    });
    const output = lines.join('');
    for (const secret of ['request-cookie-secret', 'response-cookie-secret', 'authorization-secret', 'password-secret'])
      expect(output).not.toContain(secret);
    expect(completed[0].req.headers.cookie).toBe('[REDACTED]');
    expect(completed[0].res.headers['set-cookie']).toBe('[REDACTED]');
  });

  it('thành công có code/stage null và userId khi request kết thúc', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'info', instanceId: 'test' }, { write: (line) => { lines.push(line); } });
    const app = express();
    app.use(requestId(), requestLogger(logger));
    app.get('/api/auth/me', (req, res) => {
      req.auth = { userId: 'user-id' } as NonNullable<typeof req.auth>;
      res.json({ data: {} });
    });
    await request(app).get('/api/auth/me');
    expect(JSON.parse(lines[0]!)).toMatchObject({ module: 'auth', code: null, stage: null, userId: 'user-id' });
  });
});
