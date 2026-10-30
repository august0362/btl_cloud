import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestId } from '../../src/http/middleware/request-context.js';
import { createLogger } from '../../src/lib/logger.js';
import { AuditRecorder, sanitizeMetadata, type AuditAction, type AuditEventInput } from '../../src/modules/audit/audit.recorder.js';
import type { AuditEventRow } from '../../src/modules/audit/audit.repository.js';
import { auditEventFor, createAudited } from '../../src/modules/audit/audited.js';

const NOW = new Date('2026-10-30T08:00:00.000Z');

function recorderWith(repository: { insert?: (row: AuditEventRow) => Promise<void>; deleteOlderThan?: (cutoff: Date, limit: number) => Promise<number> }) {
  const logs: Array<Record<string, unknown>> = [];
  const logger = createLogger({ level: 'warn', instanceId: 'test' }, new Writable({
    write(chunk, _encoding, callback) {
      logs.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      callback();
    },
  }));
  const repo = {
    insert: repository.insert ?? vi.fn().mockResolvedValue(undefined),
    deleteOlderThan: repository.deleteOlderThan ?? vi.fn().mockResolvedValue(0),
  };
  return { recorder: new AuditRecorder(repo, { now: () => NOW }, logger), repo, logs };
}

const baseInput: AuditEventInput = {
  actorType: 'USER',
  actorId: 'user-1',
  action: 'DOCUMENT_UPLOAD',
  targetType: 'DOCUMENT',
  targetId: 'doc-1',
  outcome: 'SUCCESS',
  errorCode: null,
  requestId: 'req-1',
};

describe('sanitizeMetadata — allowlist §A12.7', () => {
  it('chỉ giữ khoá được phép của từng hành động', () => {
    expect(sanitizeMetadata('DOCUMENT_UPLOAD', { visibility: 'PUBLIC', fileType: 'PDF', sizeBytes: 10, title: 'Bí mật', email: 'a@b.c', filename: 'x.pdf' }))
      .toEqual({ visibility: 'PUBLIC', fileType: 'PDF', sizeBytes: 10 });
    expect(sanitizeMetadata('DOCUMENT_UPDATE', { fields: ['title'], visibility: 'PRIVATE', title: 'Mới' })).toEqual({ fields: ['title'], visibility: 'PRIVATE' });
    expect(sanitizeMetadata('DOCUMENT_REPLACE', { fileType: 'DOCX', sizeBytes: 5, fileVersion: 2, originalFilename: 'a.docx' })).toEqual({ fileType: 'DOCX', sizeBytes: 5, fileVersion: 2 });
    expect(sanitizeMetadata('ADMIN_ACCOUNT_DELETE', { maskedEmail: 'a***@b.c', deletedDocuments: 2, remainingDocuments: 0, email: 'a@b.c' }))
      .toEqual({ maskedEmail: 'a***@b.c', deletedDocuments: 2, remainingDocuments: 0 });
  });

  it('hành động không có metadata, không còn khoá nào, hoặc không truyền → null', () => {
    expect(sanitizeMetadata('AUTH_LOGIN', { email: 'a@b.c', password: 'x' })).toBeNull();
    expect(sanitizeMetadata('DOCUMENT_UPLOAD', { title: 'x' })).toBeNull();
    expect(sanitizeMetadata('DOCUMENT_UPLOAD', undefined)).toBeNull();
    expect(sanitizeMetadata('DOCUMENT_UPLOAD', { visibility: undefined })).toBeNull();
  });

  it('> 1 KB → { truncated: true }', () => {
    expect(sanitizeMetadata('DOCUMENT_UPDATE', { fields: Array.from({ length: 200 }, (_, i) => `field-${i}`) })).toEqual({ truncated: true });
  });
});

describe('AuditRecorder (XM-13)', () => {
  it('ghi một dòng với thời điểm từ clock và metadata đã lọc; không chờ', () => {
    const { recorder, repo } = recorderWith({});
    recorder.record({ ...baseInput, metadata: { visibility: 'PUBLIC', title: 'Bí mật' } });
    expect(repo.insert).toHaveBeenCalledWith({
      createdAt: NOW,
      actorType: 'USER',
      actorId: 'user-1',
      action: 'DOCUMENT_UPLOAD',
      targetType: 'DOCUMENT',
      targetId: 'doc-1',
      outcome: 'SUCCESS',
      errorCode: null,
      requestId: 'req-1',
      metadata: { visibility: 'PUBLIC' },
    });
  });

  it('INSERT lỗi → không ném, log ERROR audit.write_failed kèm action và requestId', async () => {
    const { recorder, logs } = recorderWith({ insert: () => Promise.reject(new Error('db down')) });
    expect(() => recorder.record(baseInput)).not.toThrow();
    await vi.waitFor(() => expect(logs).toHaveLength(1));
    expect(logs[0]).toMatchObject({ level: 50, event: 'audit.write_failed', action: 'DOCUMENT_UPLOAD', requestId: 'req-1' });
  });

  it('lỗi đồng bộ (vd. metadata không tuần tự hoá được) cũng chỉ log', () => {
    const { recorder, logs } = recorderWith({});
    expect(() => recorder.record({ ...baseInput, metadata: { sizeBytes: 1n } })).not.toThrow();
    expect(logs[0]).toMatchObject({ event: 'audit.write_failed', requestId: 'req-1' });
  });

  it('purgeExpired: lặp lô 10 000 tới khi hết, mốc = now − retentionDays', async () => {
    const deleteOlderThan = vi.fn().mockResolvedValueOnce(10_000).mockResolvedValueOnce(10_000).mockResolvedValueOnce(3);
    const { recorder } = recorderWith({ deleteOlderThan });
    expect(await recorder.purgeExpired(90)).toBe(20_003);
    expect(deleteOlderThan).toHaveBeenCalledTimes(3);
    expect(deleteOlderThan).toHaveBeenCalledWith(new Date('2026-08-01T08:00:00.000Z'), 10_000);
  });

  it('purgeExpired lỗi → WARN audit.purge_failed, không ném', async () => {
    const { recorder, logs } = recorderWith({ deleteOlderThan: () => Promise.reject(new Error('db down')) });
    await expect(recorder.purgeExpired(1)).resolves.toBe(0);
    expect(logs[0]).toMatchObject({ level: 40, event: 'audit.purge_failed' });
  });
});

describe('audited() — quy tắc ghi §A12.7', () => {
  function appWith(action: AuditAction, handler: (req: Request, res: Response) => void, path = '/x/:id') {
    const record = vi.fn();
    const recorder = { record, reportWriteFailure: vi.fn() } as unknown as AuditRecorder;
    const app = express();
    app.use(requestId());
    app.use((req, _res, next) => {
      const user = req.get('x-test-user');
      req.auth = user ? { userId: user, sessionId: 's', user: { id: user, email: 'e', displayName: 'd', createdAt: NOW } } : null;
      next();
    });
    app.all(path, createAudited(recorder)(action), handler);
    return { app, record };
  }

  it('2xx có actor → SUCCESS, đối tượng lấy từ :id, requestId trùng X-Request-Id', async () => {
    const { app, record } = appWith('DOCUMENT_DOWNLOAD', (_req, res) => res.status(200).send('ok'));
    const res = await request(app).get('/x/doc-9').set('x-test-user', 'user-1');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith({
      actorType: 'USER', actorId: 'user-1', action: 'DOCUMENT_DOWNLOAD', targetType: 'DOCUMENT', targetId: 'doc-9',
      outcome: 'SUCCESS', errorCode: null, requestId: res.headers['x-request-id'], metadata: undefined,
    });
  });

  it('≥ 400 có actor → FAILURE với res.locals.errorCode', async () => {
    const { app, record } = appWith('DOCUMENT_DOWNLOAD', (_req, res) => {
      res.locals.errorCode = 'DOCUMENT_NOT_FOUND';
      res.status(404).json({});
    });
    await request(app).get('/x/doc-9').set('x-test-user', 'user-b');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]?.[0]).toMatchObject({ actorId: 'user-b', outcome: 'FAILURE', errorCode: 'DOCUMENT_NOT_FOUND', targetId: 'doc-9' });
  });

  it('Guest bị 401 ở route thường → không ghi', async () => {
    const { app, record } = appWith('DOCUMENT_DOWNLOAD', (_req, res) => res.status(401).json({}));
    await request(app).get('/x/doc-9');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(record).not.toHaveBeenCalled();
  });

  it('AUTH_LOGIN thất bại → FAILURE, actor ANONYMOUS, không đối tượng (kể cả khi đang có phiên cũ)', async () => {
    const { app, record } = appWith('AUTH_LOGIN', (_req, res) => {
      res.locals.errorCode = 'INVALID_CREDENTIALS';
      res.status(401).json({});
    }, '/login');
    await request(app).post('/login');
    await request(app).post('/login').set('x-test-user', 'old-user');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    for (const [event] of record.mock.calls) {
      expect(event).toMatchObject({ actorType: 'ANONYMOUS', actorId: null, targetType: null, targetId: null, outcome: 'FAILURE', errorCode: 'INVALID_CREDENTIALS' });
    }
  });

  it('AUTH_REGISTER thành công → actor và đối tượng là user mới từ res.locals.auditActorId; metadata từ res.locals', async () => {
    const { app, record } = appWith('AUTH_REGISTER', (_req, res) => {
      res.locals.auditActorId = 'new-user';
      res.locals.auditMetadata = { email: 'không được ghi' };
      res.status(201).json({});
    }, '/register');
    await request(app).post('/register');
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0]?.[0]).toMatchObject({ actorType: 'USER', actorId: 'new-user', targetType: 'USER', targetId: 'new-user', outcome: 'SUCCESS' });
  });

  it('client ngắt trước khi response xong → FAILURE CLIENT_ABORTED', () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: false, locals: {} }) as unknown as Response;
    const req = { id: 'req-2', auth: { userId: 'user-1' } } as unknown as Request;
    expect(auditEventFor('DOCUMENT_DOWNLOAD', req, res, 'doc-1')).toMatchObject({ outcome: 'FAILURE', errorCode: 'CLIENT_ABORTED', actorId: 'user-1', targetId: 'doc-1' });
  });

  it('lỗi khi dựng sự kiện → reportWriteFailure, response không đổi, process không sập', async () => {
    const reportWriteFailure = vi.fn();
    const recorder = { record: vi.fn(), reportWriteFailure } as unknown as AuditRecorder;
    const app = express();
    app.use(requestId());
    app.get('/x/:id', (_req, res, next) => {
      Object.defineProperty(res.locals, 'auditActorId', { get: () => { throw new Error('boom'); } });
      next();
    }, createAudited(recorder)('DOCUMENT_DOWNLOAD'), (_req, res) => res.status(200).send('ok'));
    const res = await request(app).get('/x/doc-1');
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(reportWriteFailure).toHaveBeenCalledWith(expect.any(Error), 'DOCUMENT_DOWNLOAD', res.headers['x-request-id']));
  });
});
