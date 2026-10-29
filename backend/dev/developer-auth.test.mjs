/* global fetch */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createController, origin } from './controller.mjs';
import { createDeveloperAuth, provisionDeveloper } from './developer-auth.mjs';

async function fixture(t, provision = true) {
  const directory = await mkdtemp(join(tmpdir(), 'btl-developer-'));
  const file = join(directory, 'account.json');
  const credentials = provision ? await provisionDeveloper('developer', file) : null;
  let time = Date.now();
  const auth = createDeveloperAuth({ file, now: () => time });
  const actions = [];
  const manager = { status: () => ({ state: 'stopped', logs: [{ message: 'private diagnostics' }] }), execute: async (action) => { actions.push(action); } };
  const server = createController(manager, 'test-capability', 0, undefined, undefined, auth);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(file, { force: true });
    await rmdir(directory);
  });
  const request = (path, { cookie, body, method = 'GET' } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { Origin: origin, Authorization: 'Bearer test-capability', 'X-Local-Control': '1', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { file, credentials, actions, request, advance: (ms) => { time += ms; } };
}

test('browser control and diagnostics require a separately provisioned developer session, including with backend OFF', async (t) => {
  const { request, credentials, actions, file } = await fixture(t);
  const saved = await readFile(file, 'utf8');
  assert.ok(!saved.includes(credentials.password));
  assert.equal(JSON.parse(saved).passwordHash.length, 128);
  await assert.rejects(provisionDeveloper('other', file), { code: 'EEXIST' });
  assert.deepEqual(await (await request('/browser/session')).json(), { configured: true, user: null });
  for (const path of ['/status', '/start', '/stop', '/restart', '/start-all', '/stop-all']) {
    const response = await request(`/browser${path}`, { method: path === '/status' ? 'GET' : 'POST', cookie: 'session=ordinary-user; btl_developer=forged' });
    assert.equal(response.status, 401, path);
    assert.ok(!JSON.stringify(await response.json()).includes('private diagnostics'));
  }
  assert.deepEqual(actions, []);
  const invalid = await request('/browser/login', { method: 'POST', body: { username: 'developer', password: 'wrong' } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.headers.get('set-cookie'), null);
  const login = await request('/browser/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /Path=\/__local\/backend/);
  assert.deepEqual(await login.json(), { user: { username: 'developer' } });
  assert.equal((await request('/browser/start', { method: 'POST', cookie })).status, 200);
  assert.equal((await request('/browser/status', { cookie })).status, 200);
  assert.deepEqual(actions, ['start']);
  assert.equal((await request('/browser/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await request('/browser/start', { method: 'POST', cookie })).status, 401);
  // Stop.vbs and the CLI can still recover the stack using the filesystem capability.
  assert.equal((await request('/start', { method: 'POST' })).status, 200);
});

test('developer sessions expire and account reset revokes already issued cookies', async (t) => {
  const { request, credentials, file, advance } = await fixture(t);
  const login = async (body) => (await request('/browser/login', { method: 'POST', body })).headers.get('set-cookie');
  const oldCookie = await login(credentials);
  advance(8 * 60 * 60 * 1000);
  assert.equal((await request('/browser/status', { cookie: oldCookie })).status, 401);
  const cookie = await login(credentials);
  const replacement = await provisionDeveloper('replacement', file, true);
  assert.equal((await request('/browser/status', { cookie })).status, 401);
  assert.equal((await request('/browser/login', { method: 'POST', body: credentials })).status, 401);
  assert.equal((await request('/browser/status', { cookie: await login(replacement) })).status, 200);
});

test('login is closed without a provisioned account and limits repeated password guesses', async (t) => {
  const { request, file, advance } = await fixture(t, false);
  assert.deepEqual(await (await request('/browser/session')).json(), { configured: false, user: null });
  assert.equal((await request('/browser/login', { method: 'POST', body: { username: 'developer', password: 'anything' } })).status, 403);
  const credentials = await provisionDeveloper('developer', file);
  advance(60_000);
  for (let i = 0; i < 5; i++)
    assert.equal((await request('/browser/login', { method: 'POST', body: { ...credentials, password: 'wrong' } })).status, 401);
  assert.equal((await request('/browser/login', { method: 'POST', body: credentials })).status, 429);
  advance(60_000);
  assert.equal((await request('/browser/login', { method: 'POST', body: credentials })).status, 200);
  assert.equal((await request('/browser/login', { method: 'POST', body: { padding: 'x'.repeat(5000) } })).status, 413);
});
