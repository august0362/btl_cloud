/* global fetch */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShareSite } from './share-site.mjs';

test('public site serves the bundle, protects control routes and proxies API without restarting it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-share-'));
  await writeFile(join(dir, 'index.html'), '<h1>Public website</h1>');
  const seen = [];
  const backend = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ url: req.url, origin: req.headers.origin, csrf: req.headers['x-csrf-protection'], body });
    if (req.method === 'POST' && (req.headers.origin !== 'http://localhost:5173' || req.headers['x-csrf-protection'] !== '1')) {
      res.writeHead(403); res.end(); return;
    }
    res.setHeader('Set-Cookie', 'sid=example; HttpOnly; SameSite=Lax');
    res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  let publicOrigin = 'https://test.trycloudflare.com';
  let stopped = false;
  const site = createShareSite({ distDir: dir, token: 'secret', publicOrigin: () => publicOrigin,
    localOrigin: 'http://localhost:5173', backendPort: backend.address().port, shutdown: () => { stopped = true; } }).listen(0, '127.0.0.1');
  await once(site, 'listening');
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    assert.match(await (await fetch(base)).text(), /Public website/);
    assert.match(await (await fetch(`${base}/explore`)).text(), /Public website/);
    for (const path of ['/admin', '/admin/users', '/__local/backend/status', '/api/dev/services', '/%5f%5flocal/backend/status', '/%61dmin', '/api%2fdev/services']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
    const headers = { Origin: publicOrigin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json' };
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers, body: '{"username":"test"}' });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /; Secure/);
    assert.deepEqual(seen.at(-1), { url: '/api/auth/login', origin: 'http://localhost:5173', csrf: '1', body: '{"username":"test"}' });
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: publicOrigin } })).status, 403);
    assert.equal((await fetch(`${base}/__local/sharing`)).status, 404);
    const control = { Authorization: 'Bearer secret' };
    assert.equal((await fetch(`${base}/__local/sharing`, { headers: { ...control, 'X-Forwarded-For': '1.2.3.4' } })).status, 404);
    assert.equal((await fetch(`${base}/__local/sharing`, { headers: { ...control, Origin: publicOrigin } })).status, 404);
    assert.deepEqual(await (await fetch(`${base}/__local/sharing`, { headers: control })).json(), { url: publicOrigin });
    publicOrigin = null;
    assert.equal((await fetch(base)).status, 503);
    assert.equal((await fetch(`${base}/__local/sharing/stop`, { method: 'POST', headers: control })).status, 200);
    assert.equal(stopped, true);
  } finally {
    await Promise.all([new Promise((resolve) => site.close(resolve)), new Promise((resolve) => backend.close(resolve))]);
    await rm(dir, { recursive: true, force: true });
  }
});
