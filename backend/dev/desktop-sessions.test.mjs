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
  test(`${first} first: the second mode inherits the PID; each stop preserves the other mode`, async () => {
    const f = fixture();
    const other = first === 'admin' ? 'server' : 'admin';
    await f.sessions.start(first);
    const pid = f.pid;
    await f.sessions.start(other);
    assert.equal(f.pid, pid);
    assert.deepEqual(f.state, { controllerPid: pid, admin: true, server: true });
    assert.equal(f.calls.filter((call) => call === 'start-stack').length, 1);
    assert.equal(await f.sessions.stop(first), true);
    assert.equal(f.pid, pid);
    assert.equal(f.state[other], true);
    assert.equal(await f.sessions.stop(other), false);
    assert.equal(f.pid, undefined);
    assert.equal(f.state, null);
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

test('an existing launcher session is retained as admin when server is added', async () => {
  const f = fixture(true);
  await f.sessions.start('server');
  assert.equal(await f.sessions.stop('server'), true);
  assert.equal(f.pid, 100);
  assert.equal(f.state.admin, true);
});

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
