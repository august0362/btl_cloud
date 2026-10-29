import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDockerService } from './docker-services.mjs';
import { createLogs } from './logs.mjs';
import { root } from './local-config.mjs';

async function fixture(existing = false, failCreate = false, wrongOwner = false) {
  const directory = await mkdtemp(join(tmpdir(), 'btl-docker-test-'));
  const calls = [];
  let exists = existing;
  let running = existing;
  const config = { composeProject: 'test-project', runtimeDir: directory };
  const run = async (_file, args) => {
    calls.push(args);
    if (args.includes('ps')) return exists ? 'container-id' : '';
    if (args[0] === 'inspect') return JSON.stringify([{ Config: { Labels: {
      'com.docker.compose.project': config.composeProject,
      'com.docker.compose.service': 'mysql',
      'com.docker.compose.project.working_dir': wrongOwner ? 'C:/unrelated' : root,
    } }, State: { Running: running, Health: { Status: 'healthy' } } }]);
    if (args.includes('up')) { exists = true; running = !failCreate; if (failCreate) throw new Error('Port conflict'); }
    if (args[0] === 'start') running = true;
    if (args[0] === 'stop') running = false;
    return '';
  };
  return { config, calls, run, async cleanup() { await rm(join(directory, 'docker-mysql.json'), { force: true }); await rmdir(directory); } };
}
test('Docker mode persists exact owned IDs, reuses volumes and stops only those IDs', async () => {
  const f = await fixture();
  try {
    const service = createDockerService('mysql', 3306, f.config, createLogs(), f.run, false);
    await service.execute('start');
    assert.equal(service.status().managed, true);
    await service.execute('stop');
    const restarted = createDockerService('mysql', 3306, f.config, createLogs(), f.run, false);
    await restarted.execute('start'); await restarted.execute('stop');
    assert.equal(f.calls.filter((args) => args.includes('up')).length, 1);
    assert.ok(f.calls.filter((args) => args[0] === 'stop').every((args) => args.at(-1) === 'container-id'));
    assert.ok(f.calls.every((args) => !args.includes('down') && !args.includes('-v')));
  } finally { await f.cleanup(); }
});
test('pre-existing unmanaged containers are usable but never stopped or adopted', async () => {
  const f = await fixture(true);
  try {
    const service = createDockerService('mysql', 3306, f.config, createLogs(), f.run, false);
    await service.execute('start'); await service.execute('stop');
    assert.equal(service.status().managed, false);
    assert.ok(!f.calls.some((args) => args[0] === 'stop'));
  } finally { await f.cleanup(); }
});
test('failed container creation remains tracked for retry; wrong-project containers are refused', async () => {
  const f = await fixture(false, true);
  const other = await fixture(true, false, true);
  try {
    const service = createDockerService('mysql', 3306, f.config, createLogs(), f.run, false);
    await assert.rejects(service.execute('start'), /Port conflict/);
    assert.equal(service.status().managed, true);
    await service.execute('stop');
    const unrelated = createDockerService('mysql', 3306, other.config, createLogs(), other.run, false);
    await assert.rejects(unrelated.execute('start'), /không thuộc/);
    assert.ok(!other.calls.some((args) => ['stop', 'start'].includes(args[0])));
  } finally { await f.cleanup(); await other.cleanup(); }
});

test('an in-flight Docker inspection cannot overwrite the completed Stop state', async () => {
  const f = await fixture();
  let hold = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const run = async (file, args, options) => {
    const result = await f.run(file, args, options);
    if (hold && args[0] === 'inspect') { hold = false; await gate; }
    return result;
  };
  try {
    const service = createDockerService('mysql', 3306, f.config, createLogs(), run, false);
    await service.execute('start');
    hold = true;
    const reading = service.refresh();
    // Allow the first inspect to capture its old Running response.
    await Promise.resolve(); await Promise.resolve();
    await service.execute('stop');
    release(); await reading;
    assert.equal(service.status().state, 'stopped');
  } finally { release(); await f.cleanup(); }
});
