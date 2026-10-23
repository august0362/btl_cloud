import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { removeFileQuietly } from '../../src/cleanup/tmp-sweeper.js';
import { errorHandler } from '../../src/http/middleware/error-handler.js';
import { createLogger } from '../../src/lib/logger.js';
import { MAX_UPLOAD_BYTES } from '../../src/modules/files/file-types.js';
import { createUploadMiddleware } from '../../src/modules/files/upload.middleware.js';
import { expectError } from '../helpers/contract.js';
import { pdfBuffer, pdfOfSize } from '../helpers/fixtures.js';

/** Upload middleware tách riêng (M2-06): giới hạn, số tệp, tên UTF-8, dọn tệp tạm. */
let tmpDir: string;

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.id = '0b7f5d0e-2c55-4a7e-8f61-3e0f3f1a9b2c';
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.post('/upload', createUploadMiddleware(tmpDir), async (req, res) => {
    const info = { originalname: req.file?.originalname, size: req.file?.size, body: { ...req.body } };
    await removeFileQuietly(req.file?.path);
    res.json(info);
  });
  app.use(errorHandler(createLogger({ level: 'silent', instanceId: 't' })));
  return app;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'btl-upload-'));
});

describe('createUploadMiddleware', () => {
  it('giữ đúng tên tệp tiếng Việt (RK-09) và part văn bản', async () => {
    const res = await request(buildApp())
      .post('/upload')
      .field('title', 'Đề cương')
      .attach('file', pdfBuffer(), { filename: 'Đề cương Giải tích 1.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ originalname: 'Đề cương Giải tích 1.pdf', body: { title: 'Đề cương' } });
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it('tệp đúng 52 428 800 byte được nhận; 52 428 801 byte → 413 FILE_TOO_LARGE và không còn tệp tạm', async () => {
    const app = buildApp();
    const ok = await request(app).post('/upload').attach('file', pdfOfSize(MAX_UPLOAD_BYTES), 'max.pdf');
    expect(ok.status).toBe(200);
    expect(ok.body.size).toBe(MAX_UPLOAD_BYTES);
    const tooBig = await request(app).post('/upload').attach('file', pdfOfSize(MAX_UPLOAD_BYTES + 1), 'big.pdf');
    expectError(tooBig, 413, 'FILE_TOO_LARGE');
    expect(await readdir(tmpDir)).toEqual([]);
  }, 60_000);

  it('2 tệp → 400 TOO_MANY_FILES; part tệp tên khác → UNKNOWN_FIELD', async () => {
    const app = buildApp();
    const two = await request(app).post('/upload').attach('file', pdfBuffer(), 'a.pdf').attach('file', pdfBuffer(), 'b.pdf');
    expect(expectError(two, 400, 'VALIDATION_ERROR')).toEqual([{ field: 'file', issue: 'TOO_MANY_FILES', message: 'Chỉ được gửi một tệp.' }]);
    const other = await request(app).post('/upload').attach('document', pdfBuffer(), 'a.pdf');
    expect(expectError(other, 400, 'VALIDATION_ERROR')[0]).toMatchObject({ field: 'document', issue: 'UNKNOWN_FIELD' });
    expect(await readdir(tmpDir)).toEqual([]);
  });

  it('part văn bản > 16 KB → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(buildApp()).post('/upload').field('description', 'x'.repeat(17 * 1024)).attach('file', pdfBuffer(), 'a.pdf');
    expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    expect(await readdir(tmpDir)).toEqual([]);
  });
});
