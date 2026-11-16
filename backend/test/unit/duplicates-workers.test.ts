import { Worker } from 'node:worker_threads';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { TextWorkerPool } from '../../src/modules/duplicates/text-worker-pool.js';
it('terminates a hung worker before resolving, limits queued jobs to three and includes queue time in deadline', async () => {
  const workers: Worker[] = []; let running = 0, maxRunning = 0;
  const dir = await mkdtemp(path.join(tmpdir(), 'dup-timeout-')); const file = path.join(dir, 'input'); await writeFile(file, 'text');
  const pool = new TextWorkerPool({ deadlineMs: 200, createWorker: () => {
    const worker = new Worker('while(true){}', { eval: true }); workers.push(worker); running++; maxRunning = Math.max(maxRunning, running); worker.on('exit', () => running--); return worker;
  } });
  try {
    const tasks = Array.from({ length: 5 }, () => pool.analyze(file, 'PDF', 4));
    expect(await tasks[4]).toMatchObject({ status: 'SKIPPED', reason: 'BUSY' });
    expect(await Promise.all(tasks.slice(0, 4))).toEqual(Array.from({ length: 4 }, () => expect.objectContaining({ status: 'SKIPPED', reason: 'TIMEOUT' })));
    expect(running).toBe(0); expect(maxRunning).toBe(1); expect(workers.length).toBeLessThanOrEqual(2);
    await rm(file); // Resolving timeout must wait for termination, including file handles.
  } finally { await rm(dir, { recursive: true, force: true }); }
});
