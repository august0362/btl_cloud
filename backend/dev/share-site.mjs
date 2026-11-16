/* global Buffer */
import express from 'express';
import helmet from 'helmet';
import { request } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { URL } from 'node:url';

// Serve a production frontend beside the existing API. The backend's PID and
// origin configuration stay unchanged when sharing is enabled from admin.
export function createShareSite({ distDir, token, publicOrigin, localOrigin, backendPort = 3000, shutdown }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('env', 'production');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use((req, res, next) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.sendStatus(400); return; }
    if (/^\/__local(?:\/|$)/i.test(path)) {
      const expected = Buffer.from(`Bearer ${token}`);
      const actual = Buffer.from(req.headers.authorization ?? '');
      const authorized = req.headers.host === `127.0.0.1:${req.socket.localPort}` &&
        !req.headers.origin && !req.headers.forwarded && !req.headers['x-forwarded-for'] &&
        actual.length === expected.length && timingSafeEqual(actual, expected);
      if (!authorized) { res.sendStatus(404); return; }
      res.setHeader('Cache-Control', 'no-store');
      if (path === '/__local/sharing' && req.method === 'GET') { res.json({ url: publicOrigin() }); return; }
      if (path === '/__local/sharing/stop' && req.method === 'POST') {
        res.once('finish', shutdown); res.json({ accepted: true }); return;
      }
      res.sendStatus(404); return;
    }
    if (/^\/(?:admin|api\/dev)(?:\/|$)/i.test(path)) { res.sendStatus(404); return; }
    if (!publicOrigin()) { res.sendStatus(503); return; }
    if (/^\/api(?:\/|$)/i.test(path)) {
      // Validate the public Origin before mapping it to the API's existing local
      // allowlist. The API still requires X-CSRF-Protection on every write.
      if (req.headers.origin && req.headers.origin !== publicOrigin()) { res.sendStatus(403); return; }
      const headers = { ...req.headers, host: `127.0.0.1:${backendPort}` };
      for (const name of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'connection']) delete headers[name];
      if (headers.origin) headers.origin = localOrigin;
      if (isIP(req.headers['cf-connecting-ip'] ?? '')) headers['x-forwarded-for'] = req.headers['cf-connecting-ip'];
      headers['x-forwarded-proto'] = 'https';
      const upstream = request({ host: '127.0.0.1', port: backendPort, method: req.method, path: req.url, headers }, (response) => {
        const output = { ...response.headers };
        if (output['set-cookie']) output['set-cookie'] = output['set-cookie'].map((cookie) => /;\s*Secure(?:;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`);
        res.writeHead(response.statusCode ?? 502, output);
        response.pipe(res);
      });
      upstream.setTimeout(900_000, () => upstream.destroy(new Error('API timeout')));
      upstream.on('error', () => { if (!res.headersSent) res.sendStatus(502); else res.destroy(); });
      res.once('close', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    next();
  });
  app.use(express.static(distDir, { index: false, setHeaders(res, file) {
    res.setHeader('Cache-Control', file.includes(`${join(distDir, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  } }));
  app.use((req, res) => {
    if (['GET', 'HEAD'].includes(req.method) && req.accepts('html') && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache'); res.sendFile(join(distDir, 'index.html'));
    } else res.sendStatus(404);
  });
  return app;
}
