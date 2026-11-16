import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopSessions } from './desktop-sessions.mjs';

function fixture(existing = false) {
  let stack = existing ? { pid: 100 } : null;
  let state = null;
  let share = null;
  let nextPid = 100;
  const calls = [];
  const io = {
    stack: async () => stack,
    read: async () => state && { ...state }, write: async (value) => { state = { ...value }; }, remove: async () => { state = null; },
    sharing: async () => share,
    startStack: async () => { if (!stack) { stack = { pid: nextPid++ }; calls.push('start-stack'); } },
    stopStack: async () => { calls.push('stop-stack'); stack = null; },
    startSharing: async () => { if (!share) { calls.push('start-sharing'); share = { url: 'https://test.trycloudflare.com' }; } return share; },
    stopSharing: async () => { if (share) calls.push('stop-sharing'); share = null; },
    openAdmin: async () => { calls.push('open-admin'); }, copy: async (url) => { calls.push(`copy:${url}`); },
  };
  return { sessions: createDesktopSessions(io), calls, io, get state() { return state; }, get pid() { return stack?.pid; } };
}

for (const first of ['admin', 'server']) {
  test(`${first} first: admin stop preserves the server; server stop shuts down both modes`, async () => {
    const f = fixture();
    const other = first === 'admin' ? 'server' : 'admin';
    await f.sessions.start(first);
    const pid = f.pid;
    await f.sessions.start(other);
    assert.equal(f.pid, pid);
    assert.deepEqual(f.state, { controllerPid: pid, admin: true, server: true });
    assert.equal(f.calls.filter((call) => call === 'start-stack').length, 1);
    const share = await f.io.sharing();
    assert.equal(await f.sessions.stop('admin'), true);
    assert.equal(f.pid, pid);
    assert.deepEqual(f.state, { controllerPid: pid, admin: false, server: true });
    assert.equal(await f.io.sharing(), share);
    assert.equal(f.calls.includes('stop-sharing'), false);
    assert.equal(f.calls.includes('stop-stack'), false);
    await f.sessions.start('admin');
    assert.equal(f.pid, pid);
    assert.equal(await f.sessions.stop('server'), false);
    assert.equal(f.pid, undefined);
    assert.equal(f.state, null);
    assert.equal(await f.io.sharing(), null);
    assert.deepEqual(f.calls.slice(-2), ['stop-sharing', 'stop-stack']);
  });
}

test('repeated server clicks copy the same URL without restarting the stack or tunnel', async () => {
  const f = fixture();
  await f.sessions.start('server'); await f.sessions.start('server');
  assert.equal(f.calls.filter((call) => call === 'start-sharing').length, 1);
  assert.equal(f.calls.filter((call) => call.startsWith('copy:')).length, 2);
  assert.equal(f.calls.filter((call) => call === 'start-stack').length, 1);
  assert.equal(f.calls.includes('open-admin'), false);
});

test('server stop also shuts down an existing launcher session adopted as admin', async () => {
  const f = fixture(true);
  await f.sessions.start('server');
  assert.equal(f.pid, 100);
  assert.equal(f.state.admin, true);
  assert.equal(await f.sessions.stop('server'), false);
  assert.equal(f.pid, undefined);
  assert.equal(f.state, null);
});

for (const role of ['admin', 'server']) {
  test(`${role} stop shuts down an admin-only session`, async () => {
    const f = fixture();
    await f.sessions.start('admin');
    assert.equal(await f.sessions.stop(role), false);
    assert.equal(f.pid, undefined);
    assert.equal(f.state, null);
  });
}

test('stopping the unused mode preserves a running server; stopping twice is harmless', async () => {
  const f = fixture();
  await f.sessions.start('server');
  assert.equal(await f.sessions.stop('admin'), true);
  assert.equal(f.state.server, true);
  assert.equal(await f.sessions.stop('server'), false);
  assert.equal(await f.sessions.stop('server'), false);
});

test('a crashed tunnel does not keep the stack alive when admin is stopped', async () => {
  const f = fixture();
  await f.sessions.start('admin'); await f.sessions.start('server');
  await f.io.stopSharing();
  assert.equal(await f.sessions.stop('admin'), false);
  assert.equal(f.pid, undefined);
});

test('clipboard failure keeps the successfully started server registered for stop/retry', async () => {
  const f = fixture();
  f.io.copy = async () => { throw new Error('clipboard busy'); };
  await assert.rejects(f.sessions.start('server'), /clipboard busy/);
  assert.equal(f.state.server, true);
  assert.equal(await f.sessions.stop('server'), false);
});
