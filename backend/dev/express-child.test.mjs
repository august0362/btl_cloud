/* global process, setTimeout, clearTimeout, fetch */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const childPath = fileURLToPath(new URL('express-child.mjs', import.meta.url));
const defaultSnapshot = join(backendDir, 'tmp', 'metrics-snapshot.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Backend thật qua express-child (dev, tsx) với DB/S3 không tồn tại: liveness vẫn 200 (D-14), không cần MySQL.
async function startChild(dir, metricsFile) {
  const port = await freePort();
  const env = { ...process.env };
  delete env.BTL_LOCAL_METRICS_FILE;
  Object.assign(env, {
    NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'silent',
    DATABASE_URL: 'mysql://none:none@127.0.0.1:1/none', S3_BUCKET: 'metrics-test', S3_ENDPOINT: 'http://127.0.0.1:1',
    S3_FORCE_PATH_STYLE: 'true', AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'x', UPLOAD_TMP_DIR: join(dir, 'uploads'),
    ...(metricsFile ? { BTL_LOCAL_METRICS_FILE: metricsFile } : {}),
  });
  const child = fork(childPath, [], { cwd: backendDir, env, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`express-child thoát sớm (${child.exitCode}): ${stderr}`);
    try {
      if ((await fetch(`${base}/api/health`)).status === 200) return { child, base };
    } catch { /* chưa lắng nghe */ }
    await delay(250);
  }
  child.kill();
  throw new Error(`express-child không sẵn sàng: ${stderr}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return child.exitCode;
  let timer;
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), 15_000); });
  child.send('local:shutdown');
  const code = await Promise.race([exited, timedOut]);
  clearTimeout(timer);
  if (code === 'timeout') child.kill();
  return code;
}

async function mtimeOrNull(file) {
  try { return (await stat(file)).mtimeMs; } catch { return null; }
}

test('express-child ghi metrics-snapshot.json mỗi 5 s chỉ khi có BTL_LOCAL_METRICS_FILE (XM-05, XD-04)', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-metrics-'));
  const metricsFile = join(dir, 'nested', 'metrics-snapshot.json');
  const defaultBefore = await mtimeOrNull(defaultSnapshot);
  const [withFile, withoutFile] = await Promise.all([startChild(dir, metricsFile), startChild(dir, null)]);
  try {
    for (let i = 0; i < 5; i += 1) assert.equal((await fetch(`${withFile.base}/api/health`)).status, 200);

    let snapshot;
    for (let attempt = 0; attempt < 60 && !(snapshot?.requests.total >= 5); attempt += 1) {
      await delay(250);
      try { snapshot = JSON.parse(await readFile(metricsFile, 'utf8')); } catch { /* chưa có file hoặc đang đổi tên */ }
    }
    assert.ok(snapshot, 'phải có file snapshot');
    // Cùng instance metrics với server.ts: thấy các request vừa gửi.
    assert.ok(snapshot.requests.total >= 5, `total = ${snapshot?.requests.total}`);
    assert.equal(snapshot.windowSeconds, 300);
    assert.equal(snapshot.requests.buckets.length, 30);
    assert.ok(snapshot.latencyMs.samples >= 5);
    assert.equal(snapshot.requests.inFlight, 0);
    const firstAt = snapshot.at;

    // Ghi lại theo chu kỳ 5 s.
    let next = snapshot;
    for (let attempt = 0; attempt < 40 && next.at === firstAt; attempt += 1) {
      await delay(250);
      try { next = JSON.parse(await readFile(metricsFile, 'utf8')); } catch { /* đang đổi tên */ }
    }
    assert.notEqual(next.at, firstAt, 'snapshot phải được cập nhật');
    const gap = Date.parse(next.at) - Date.parse(firstAt);
    assert.ok(gap >= 4_000 && gap <= 7_000, `chu kỳ ${gap} ms`);
    assert.deepEqual((await readdir(join(dir, 'nested'))).filter((name) => name.endsWith('.tmp')), []);

    // Tiến trình không có biến: không tạo file ở vị trí mặc định của controller.
    assert.equal(await mtimeOrNull(defaultSnapshot), defaultBefore);
    assert.equal(withoutFile.child.exitCode, null);
  } finally {
    const codes = await Promise.all([stopChild(withFile.child), stopChild(withoutFile.child)]);
    await rm(dir, { recursive: true, force: true });
    assert.deepEqual(codes, [0, 0]);
  }
});
