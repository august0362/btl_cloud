import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CleanupWorker } from '../../src/cleanup/cleanup.worker.js';
import { createLogger } from '../../src/lib/logger.js';
import { pdfBuffer, writeTempFile } from '../helpers/fixtures.js';
import { createTestContext, objectExists, registerUser, resetDatabase, uploadDocument, type TestContext } from './context.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  ctx.storage.reset();
  await resetDatabase(ctx.prisma);
});

let keyCounter = 0;
async function orphanObject(): Promise<string> {
  keyCounter += 1;
  const key = `documents/00000000-0000-4000-8000-00000000aaaa/${Date.now()}-${keyCounter}.pdf`;
  await ctx.s3.putObject({ key, filePath: await writeTempFile('o.pdf', pdfBuffer()), contentType: 'application/pdf', contentLength: 10 });
  return key;
}

async function insertTask(storageKey: string, nextAttemptAt: Date) {
  return ctx.services.cleanupTasks.insert({ storageKey, reason: 'DELETED', documentId: null, nextAttemptAt });
}

describe('CleanupService.processTask (M2-13, §A6.8)', () => {
  it('chỉ xử lý task đến hạn', async () => {
    const due = await orphanObject();
    const later = await orphanObject();
    await insertTask(due, new Date(Date.now() - 1000));
    await insertTask(later, new Date(Date.now() + 60_000));
    expect(await ctx.services.cleanup.runDueTasks(20)).toBe(1);
    expect(await objectExists(ctx.s3, due)).toBe(false);
    expect(await objectExists(ctx.s3, later)).toBe(true);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(1);
  });

  it('2 lời gọi processTask đồng thời → chỉ một tiến trình claim được (D-10)', async () => {
    const key = await orphanObject();
    const id = await insertTask(key, new Date(Date.now() - 1000));
    const results = await Promise.all([ctx.services.cleanup.processTask(id), ctx.services.cleanup.processTask(id)]);
    expect(results.sort()).toEqual(['done', 'not_claimed']);
    expect(await objectExists(ctx.s3, key)).toBe(false);
  });

  it('lưới an toàn: key còn được documents tham chiếu → không xoá object, xoá task', async () => {
    const user = await registerUser(ctx.app);
    const doc = await uploadDocument(user);
    const row = await ctx.prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    const id = await insertTask(row.storageKey, new Date(Date.now() - 1000));
    expect(await ctx.services.cleanup.processTask(id)).toBe('skipped_referenced');
    expect(await objectExists(ctx.s3, row.storageKey)).toBe(true);
    expect(await ctx.prisma.storageCleanupTask.count()).toBe(0);
  });

  it('backoff 1, 2, 4 phút sau các lần thất bại liên tiếp; ghi last_error', async () => {
    const key = await orphanObject();
    const id = await insertTask(key, new Date(Date.now() - 1000));
    for (const expectedMinutes of [1, 2, 4]) {
      ctx.storage.failDelete = 1;
      const start = Date.now();
      expect(await ctx.services.cleanup.processTask(id)).toBe('failed');
      const task = await ctx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { id } });
      const delayMinutes = (task.nextAttemptAt.getTime() - start) / 60_000;
      expect(delayMinutes).toBeGreaterThan(expectedMinutes - 0.1);
      expect(delayMinutes).toBeLessThan(expectedMinutes + 0.1);
      await ctx.prisma.storageCleanupTask.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    }
    expect((await ctx.prisma.storageCleanupTask.findUniqueOrThrow({ where: { id } })).attempts).toBe(3);
  });
});

describe('CleanupWorker.tick (M2-13)', () => {
  it('một lượt: xử lý task đến hạn, xoá phiên hết hạn, xoá tệp tạm cũ hơn 60 phút; dừng êm', async () => {
    const key = await orphanObject();
    await insertTask(key, new Date(Date.now() - 1000));
    const user = await registerUser(ctx.app);
    await ctx.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const live = await registerUser(ctx.app);

    // Thư mục riêng, không dùng chung thư mục tạm upload của các test khác.
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'btl-sweep-'));
    const oldFile = path.join(tmpDir, 'cu');
    const newFile = path.join(tmpDir, 'moi');
    await writeFile(oldFile, 'x');
    await writeFile(newFile, 'y');
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    await utimes(oldFile, twoHoursAgo, twoHoursAgo);

    const worker = new CleanupWorker(ctx.services.cleanup, ctx.services.sessions, ctx.services.clock, createLogger({ level: 'silent', instanceId: 't' }), {
      intervalSeconds: 3600,
      tmpDir,
    });
    await worker.tick();
    expect(await objectExists(ctx.s3, key)).toBe(false);
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.session.count({ where: { userId: live.id } })).toBe(1);
    expect(await readdir(tmpDir)).toEqual(['moi']);
    await rm(tmpDir, { recursive: true, force: true });

    worker.start();
    await worker.stop();
  });
});
