import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppError } from '../../src/http/errors.js';
import { errorHandler } from '../../src/http/middleware/error-handler.js';
import { createLogger } from '../../src/lib/logger.js';

it('serializes duplicate matches only when present and retains the legacy error envelope', async () => {
  const app = express();
  app.get('/duplicate', (_req, _res, next) => next(new AppError('DUPLICATE_DOCUMENT', { duplicates: [{ id: 'visible' }] })));
  app.get('/legacy', (_req, _res, next) => next(new AppError('FORBIDDEN')));
  app.use(errorHandler(createLogger({ level: 'silent', instanceId: 'test' })));
  const duplicate = await request(app).get('/duplicate');
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error).toMatchObject({ code: 'DUPLICATE_DOCUMENT', duplicates: [{ id: 'visible' }] });
  const legacy = await request(app).get('/legacy');
  expect(legacy.status).toBe(403);
  expect(legacy.body.error).not.toHaveProperty('duplicates');
});
