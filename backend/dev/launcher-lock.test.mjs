/* global process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireLauncherLock } from './launcher-lock.mjs';

test('concurrent Start joins the launch, but Stop waits for Start instead of being discarded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-launch-lock-'));
  const file = join(dir, 'launcher.lock');
  const start = await acquireLauncherLock(file, 'start', 'test');
  let stop;
  try {
    assert.equal(await acquireLauncherLock(file, 'start', 'test'), null);
    let acquired = false;
    const waiting = acquireLauncherLock(file, 'stop', 'test', { pollMs: 10, timeout: 1000 }).then((lease) => { acquired = true; return lease; });
    await delay(30);
    assert.equal(acquired, false);
    await start.release();
    stop = await waiting;
    assert.equal(JSON.parse(await readFile(file, 'utf8')).action, 'stop');
  } finally { if (stop) await stop.release(); else await start.release(); await rmdir(dir); }
});

test('a waiting Stop reports a timeout explicitly and preserves the active owner lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-launch-lock-'));
  const file = join(dir, 'launcher.lock');
  const start = await acquireLauncherLock(file, 'start', 'test');
  try {
    await assert.rejects(acquireLauncherLock(file, 'stop', 'test', { pollMs: 5, timeout: 25 }), /yêu cầu chưa được thực hiện/);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).pid, process.pid);
  } finally { await start.release(); await rmdir(dir); }
});

test('stale lock is replaced and the acquired lease is removed on release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-launch-lock-'));
  const file = join(dir, 'launcher.lock');
  await writeFile(file, JSON.stringify({ pid: 2147483647, projectId: 'test', action: 'start' }));
  const lease = await acquireLauncherLock(file, 'stop', 'test');
  try {
    assert.equal(JSON.parse(await readFile(file, 'utf8')).action, 'stop');
  } finally { await lease.release(); }
  await assert.rejects(access(file), { code: 'ENOENT' });
  await rmdir(dir);
});
