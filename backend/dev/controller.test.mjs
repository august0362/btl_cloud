/* global Buffer, fetch, process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { createController, origin } from './controller.mjs';
import { createProcessManager } from './process-manager.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const close = (server) => new Promise((resolve) => server.close(resolve));

test('controller requires capability + exact Host/Origin + write header; denies preflight and GET mutations', async () => {
  const calls = [];
  const manager = { status: () => ({ state: 'stopped' }), execute: async (action) => { calls.push(action); } };
  const token = Buffer.alloc(32, 1).toString('hex');
  const server = createController(manager, token, 0);
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}`;
  const headers = { Origin: origin, Authorization: `Bearer ${token}`, 'X-Local-Control': '1' };
  try {
    for (const altered of [{ Authorization: '' }, { Origin: 'http://evil.test' }, { Origin: '' }, { 'X-Local-Control': '' }]) {
      const response = await fetch(`${url}/start`, { method: 'POST', headers: { ...headers, ...altered } });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    }
    const wrongHost = await new Promise((resolve, reject) => {
      const req = request(`${url}/start`, { method: 'POST', headers: { ...headers, Host: 'evil.test' } }, (response) => {
        response.resume(); resolve(response.statusCode);
      });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    assert.equal((await fetch(`${url}/start`, { headers })).status, 403);
    assert.equal((await fetch(`${url}/start`, { method: 'OPTIONS', headers })).status, 403);
    assert.equal((await fetch(`${url}/status`, { headers })).status, 200);
    assert.equal((await fetch(`${url}/start`, { method: 'POST', headers })).status, 200);
    assert.deepEqual(calls, ['start']);
  } finally { await close(server); }
});

test('Stop All acknowledges before shutting down services and controller', async () => {
  const calls = [];
  let stopped = false;
  const manager = { status: () => ({ state: 'running' }), execute: async (action) => { calls.push(action); } };
  const server = createController(manager, 'token', 0, () => { stopped = true; });
  const port = await listen(server);
  const headers = { Origin: origin, Authorization: 'Bearer token', 'X-Local-Control': '1' };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/stop-all`, { method: 'POST', headers });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).accepted, true);
    assert.equal(stopped, false);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 400));
    assert.deepEqual(calls, ['stop-all']);
    assert.equal(stopped, true);
  } finally { await close(server); }
});

test('Stop All waits for an in-flight Start before shutdown and blocks further mutations', async () => {
  let starting = true;
  let stopped = false;
  let failure;
  const actions = [];
  const manager = { status: () => ({ state: 'starting', busy: starting }), execute: async (action) => {
    assert.equal(starting, false); actions.push(action);
  } };
  const server = createController(manager, 'token', 0, () => { stopped = true; }, (error) => { failure = error; });
  const port = await listen(server);
  const headers = { Origin: origin, Authorization: 'Bearer token', 'X-Local-Control': '1' };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/stop-all`, { method: 'POST', headers });
    assert.equal(response.status, 202);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 450));
    assert.deepEqual(actions, []);
    assert.equal(failure, undefined);
    assert.equal((await fetch(`http://127.0.0.1:${port}/start`, { method: 'POST', headers })).status, 409);
    starting = false;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 200));
    assert.deepEqual(actions, ['stop-all']);
    assert.equal(stopped, true);
  } finally { starting = false; await close(server); }
});

test('owned child start/stop/restart is serialized and graceful, controller and unrelated service survive', async () => {
  const reserve = createServer();
  const port = await listen(reserve);
  await close(reserve);
  const unrelated = createServer((_req, res) => res.end('unrelated'));
  const otherPort = await listen(unrelated);
  const manager = createProcessManager({ cwd: fileURLToPath(new URL('..', import.meta.url)), args: ['dev/fixtures/server.mjs'], port });
  const controller = createController(manager, 'test-token', 0);
  const controlPort = await listen(controller);
  try {
    const starting = manager.execute('start');
    await assert.rejects(manager.execute('start'), /BUSY/);
    await starting;
    const firstPid = manager.status().pid;
    assert.equal(manager.status().state, 'running');
    await manager.execute('stop');
    assert.equal(manager.status().state, 'stopped');
    assert.equal(manager.status().events.at(-1).message, 'Đã dừng (mã 0).');
    const headers = { Origin: origin, Authorization: 'Bearer test-token' };
    assert.equal((await fetch(`http://127.0.0.1:${controlPort}/status`, { headers })).status, 200);
    assert.equal(await (await fetch(`http://127.0.0.1:${otherPort}`)).text(), 'unrelated');
    await manager.execute('start');
    assert.notEqual(manager.status().pid, firstPid);
    const secondPid = manager.status().pid;
    await manager.execute('restart');
    assert.notEqual(manager.status().pid, secondPid);
    assert.equal(manager.status().state, 'running');
  } finally {
    await manager.execute('stop');
    await close(controller);
    await close(unrelated);
  }
});

test('refuses to adopt or stop a process already using the backend port', async () => {
  const external = createServer((_req, res) => res.end('existing'));
  const port = await listen(external);
  const manager = createProcessManager({ cwd: fileURLToPath(new URL('..', import.meta.url)), args: ['dev/fixtures/server.mjs'], port });
  try {
    await assert.rejects(manager.execute('start'), /tiến trình khác/);
    await manager.execute('stop');
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'existing');
  } finally { await close(external); }
});

test('local controller can own the built-site mode while frontend workers remain development-only', async () => {
  for (const name of ['backend', 'frontend']) {
    const reserve = createServer();
    const port = await listen(reserve); await close(reserve);
    const manager = createProcessManager({ name, cwd: fileURLToPath(new URL('..', import.meta.url)), args: ['dev/fixtures/server.mjs'], port,
      env: { ...process.env, BTL_LOCAL_PRODUCTION: '1', HOST: '127.0.0.1' } });
    try {
      await manager.execute('start');
      assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/environment`)).json(), {
        nodeEnv: name === 'backend' ? 'production' : 'development', serveFrontend: name === 'backend' ? 'true' : 'false', host: '127.0.0.1',
      });
    } finally { await manager.execute('stop'); }
  }
});

test('nonzero shutdown exit is reported instead of being silently accepted', async () => {
  const reserve = createServer();
  const port = await listen(reserve); await close(reserve);
  const manager = createProcessManager({ cwd: fileURLToPath(new URL('..', import.meta.url)), args: ['dev/fixtures/server.mjs'], port,
    env: { ...process.env, BTL_TEST_STOP_ERROR: '1' } });
  await manager.execute('start');
  await assert.rejects(manager.execute('stop'), /mã 2/);
  assert.equal(manager.status().state, 'failed');
  assert.equal(manager.status().managed, false);
});

test('a late readiness response cannot mark an already exited child as running', async () => {
  const reserve = createServer();
  const port = await listen(reserve); await close(reserve);
  let release;
  let probing;
  const ready = new Promise((resolve) => { release = resolve; });
  const probe = new Promise((resolve) => { probing = resolve; });
  const manager = createProcessManager({ cwd: fileURLToPath(new URL('..', import.meta.url)), args: ['dev/fixtures/server.mjs'], port,
    ready: () => { probing(); return ready; } });
  const starting = manager.execute('start');
  await probe;
  process.kill(manager.status().pid);
  for (let attempt = 0; manager.status().managed && attempt < 100; attempt++) await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  release(true);
  await assert.rejects(starting, /dừng ngoài dự kiến|đã thoát/);
  assert.equal(manager.status().state, 'failed');
  assert.equal(manager.status().managed, false);
});
