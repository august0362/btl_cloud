import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStackManager } from './stack-manager.mjs';
import { createLogs } from './logs.mjs';

function fixture() {
  const calls = [];
  const faults = new Set();
  const adapters = Object.fromEntries(['mysql', 'seaweedfs', 'backend', 'frontend'].map((name, index) => {
    let state = 'stopped';
    return [name, { status: () => ({ state, pid: state === 'running' ? index + 100 : null, managed: state === 'running', lastError: state === 'failed' ? 'Lỗi thử nghiệm' : null }),
      async execute(action) {
        if (action === 'start' && state === 'running') return;
        calls.push(`${action}:${name}`);
        if (faults.has(name)) { state = 'failed'; throw new Error(`${name} thử nghiệm thất bại`); }
        state = action === 'start' ? 'running' : 'stopped';
      } }];
  }));
  return { calls, faults, adapters };
}
test('Start All is idempotent, shares concurrent starts, and starts dependencies before application', async () => {
  const f = fixture();
  let prepareCount = 0;
  let setupCount = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const manager = createStackManager({ env: {} }, createLogs(), { adapters: f.adapters,
    prepareDependencies: async () => { prepareCount++; await gate; }, prepareApplication: async () => { setupCount++; } });
  const first = manager.execute('start-all');
  const second = manager.execute('start-all');
  assert.equal(first, second);
  release();
  await first;
  await manager.execute('start-all');
  assert.deepEqual(f.calls, ['start:mysql', 'start:seaweedfs', 'start:backend', 'start:frontend']);
  assert.equal(prepareCount, 1);
  assert.equal(setupCount, 1);
});
test('partial failure keeps Frontend available for logs; Start All retries only missing services', async () => {
  const f = fixture(); f.faults.add('mysql');
  const logs = createLogs();
  const manager = createStackManager({ env: {} }, logs, { adapters: f.adapters, prepareDependencies: async () => {}, prepareApplication: async () => {} });
  await assert.rejects(manager.execute('start-all'), /mysql/);
  assert.equal(f.adapters.frontend.status().state, 'running');
  assert.equal(f.adapters.backend.status().state, 'stopped');
  assert.ok(logs.snapshot().some((entry) => entry.level === 'ERROR'));
  f.faults.clear();
  await manager.execute('start-all');
  assert.equal(f.adapters.backend.status().state, 'running');
  assert.equal(f.calls.filter((entry) => entry === 'start:frontend').length, 1);
  assert.equal(f.calls.filter((entry) => entry === 'start:seaweedfs').length, 1);
});
test('Backend OFF leaves other services alive; Stop All drains backend before frontend and dependencies', async () => {
  const f = fixture();
  const manager = createStackManager({ env: {} }, createLogs(), { adapters: f.adapters, prepareDependencies: async () => {}, prepareApplication: async () => {} });
  await manager.execute('start-all');
  await manager.execute('stop');
  assert.equal(f.adapters.frontend.status().state, 'running');
  assert.equal(f.adapters.mysql.status().state, 'running');
  assert.equal(f.adapters.seaweedfs.status().state, 'running');
  await manager.execute('start');
  f.calls.length = 0;
  await manager.execute('stop-all');
  assert.deepEqual(f.calls, ['stop:backend', 'stop:frontend', 'stop:seaweedfs', 'stop:mysql']);
  await manager.execute('start-all');
  assert.equal(manager.status().services.every((entry) => entry.state === 'running'), true);
});
test('shutdown reports errors but still attempts every managed service', async () => {
  const f = fixture();
  const manager = createStackManager({ env: {} }, createLogs(), { adapters: f.adapters, prepareDependencies: async () => {}, prepareApplication: async () => {} });
  await manager.execute('start-all'); f.calls.length = 0; f.faults.add('seaweedfs');
  await assert.rejects(manager.execute('stop-all'), /seaweedfs/);
  assert.deepEqual(f.calls, ['stop:backend', 'stop:frontend', 'stop:seaweedfs', 'stop:mysql']);
  assert.match(manager.status().lastError, /seaweedfs/);
});

test('recovering Backend reuses prepared schema/storage instead of repeating bootstrap', async () => {
  const f = fixture();
  let prepared = 0;
  const manager = createStackManager({ env: {} }, createLogs(), { adapters: f.adapters, prepareDependencies: async () => {}, prepareApplication: async () => { prepared++; } });
  await manager.execute('start-all');
  await manager.execute('stop');
  await manager.execute('start-all');
  assert.equal(prepared, 1);
  assert.equal(f.calls.filter((entry) => entry === 'start:mysql').length, 1);
  assert.equal(f.calls.filter((entry) => entry === 'start:backend').length, 2);
});
test('XM-02 admin: absent folder → not-installed and Start All still OK; present → started last, stopped first', async () => {
  const f = fixture();
  const absent = createStackManager({ env: {} }, createLogs(), { adapters: f.adapters, prepareDependencies: async () => {}, prepareApplication: async () => {} });
  await absent.execute('start-all');
  assert.equal(absent.status().admin.state, 'not-installed');
  assert.equal(absent.admin().installed, false);

  const g = fixture();
  let adminState = 'stopped';
  const admin = { status: () => ({ state: adminState }), async execute(action) { g.calls.push(`${action}:admin`); adminState = action === 'start' ? 'running' : 'stopped'; } };
  const present = createStackManager({ env: {} }, createLogs(), { adapters: { ...g.adapters, admin }, adminToken: 't', prepareDependencies: async () => {}, prepareApplication: async () => {} });
  await present.execute('start-all');
  assert.deepEqual(present.admin(), { installed: true, running: true, token: 't', port: 3003 });
  await present.execute('stop-all');
  assert.deepEqual(g.calls, ['start:mysql', 'start:seaweedfs', 'start:backend', 'start:frontend', 'start:admin',
    'stop:admin', 'stop:backend', 'stop:frontend', 'stop:seaweedfs', 'stop:mysql']);
});
