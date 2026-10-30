/* global process, console, Buffer, setTimeout */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request } from 'node:http';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createStackManager } from './stack-manager.mjs';
import { createLogs } from './logs.mjs';
import { notifyFailure } from './commands.mjs';
import { createDeveloperAuth } from './developer-auth.mjs';
import { localConfig, runtimeDir, runtimeFile, diagnosticFile, projectId } from './local-config.mjs';

export { runtimeFile } from './local-config.mjs';
export const origin = 'http://localhost:5173';
const controllerPort = 3001;

async function readBody(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  return size > limit ? null : Buffer.concat(chunks);
}

// XM-02: chuyển tiếp /browser/admin/* tới admin local kèm token và actor; admin tự kiểm token (XA-01).
async function proxyAdmin(req, res, reply, admin, actor) {
  if (!admin?.installed) { reply(404, { error: 'Admin chưa được cài trên máy này.' }); return; }
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) { reply(405, { error: 'Phương thức không được hỗ trợ.' }); return; }
  const body = await readBody(req, 16_384);
  if (!body) { reply(413, { error: 'Yêu cầu quá lớn.' }); return; }
  if (!admin.running) { reply(503, { error: 'Admin đang tắt. Dùng Start All để khởi động.' }); return; }
  await new Promise((resolve) => {
    const upstream = request({ host: '127.0.0.1', port: admin.port, path: req.url, method: req.method,
      headers: { Authorization: `Bearer ${admin.token}`, 'X-Admin-Actor': actor, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, { 'Content-Type': response.headers['content-type'] ?? 'application/json; charset=utf-8' });
      response.pipe(res);
      response.once('end', resolve);
    });
    upstream.once('error', () => { if (!res.headersSent) reply(503, { error: 'Admin đang tắt. Dùng Start All để khởi động.' }); resolve(); });
    upstream.end(body);
  });
}

export function createController(manager, token, port = controllerPort, onShutdown, onFailure = () => {}, developerAuth = createDeveloperAuth()) {
  let shuttingDown = false;
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
        req.headers.forwarded || req.headers['x-forwarded-for'] ||
        req.headers.host !== `127.0.0.1:${port || res.socket.localPort}` || req.headers.origin !== origin ||
        auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      reply(403, { error: 'Không được phép truy cập bộ điều khiển cục bộ.' }); return;
    }
    // Vite can only forward browser requests under /browser. CLI uses the on-disk capability.
    let actor;
    if (req.url.startsWith('/browser/')) {
      req.url = req.url.slice('/browser'.length);
      try {
        if (req.method === 'GET' && req.url === '/session') {
          reply(200, await developerAuth.status(req.headers.cookie)); return;
        }
        if (req.method === 'POST' && req.headers['x-local-control'] === '1' && req.url === '/login') {
          const body = await readBody(req, 4096);
          if (!body) { reply(413, { error: 'Yêu cầu đăng nhập quá lớn.' }); return; }
          let input;
          try { input = JSON.parse(body.toString('utf8')); }
          catch { reply(400, { error: 'Dữ liệu đăng nhập không hợp lệ.' }); return; }
          const result = await developerAuth.login(input?.username, input?.password, req.headers.cookie);
          if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
          reply(result.status, result.error ? { error: result.error } : { user: result.user }); return;
        }
        if (req.method === 'POST' && req.headers['x-local-control'] === '1' && req.url === '/logout') {
          res.setHeader('Set-Cookie', developerAuth.logout(req.headers.cookie));
          reply(200, { user: null }); return;
        }
        actor = (await developerAuth.status(req.headers.cookie)).user?.username;
        if (!actor) { reply(401, { error: 'Vui lòng đăng nhập tài khoản nhà phát triển.' }); return; }
      } catch { reply(503, { error: 'Không đọc được tài khoản nhà phát triển. Hãy liên hệ người quản lý dự án.' }); return; }
      if (req.url.startsWith('/admin/')) { await proxyAdmin(req, res, reply, manager.admin?.(), actor); return; }
    }
    if (req.method === 'GET' && req.url === '/status') { reply(200, { ...manager.status(), busy: shuttingDown || manager.status().busy }); return; }
    const allowed = ['/start', '/stop', '/restart', '/start-all', ...(onShutdown ? ['/stop-all', '/shutdown'] : [])];
    if (req.method !== 'POST' || req.headers['x-local-control'] !== '1' || !allowed.includes(req.url)) {
      reply(403, { error: 'Yêu cầu điều khiển không hợp lệ.' }); return;
    }
    if (shuttingDown) { reply(409, { error: 'Đang dừng toàn bộ dịch vụ.' }); return; }
    if (req.url === '/stop-all' || req.url === '/shutdown') {
      shuttingDown = true;
      // Acknowledge through Vite before stopping Vite itself.
      res.once('finish', () => {
        setTimeout(() => {
          (async () => {
            while (manager.status().busy) await delay(100);
            await manager.execute('stop-all');
            await onShutdown();
          })().catch(async (error) => {
            shuttingDown = false;
            await onFailure(error);
          });
        }, 300);
      });
      reply(202, { accepted: true, message: 'Đang dừng dịch vụ. Khởi động lại bằng Start.vbs hoặc run.bat start.' });
      return;
    }
    try {
      await manager.execute(req.url.slice(1));
      reply(200, manager.status());
    } catch (error) { reply(error.message === 'BUSY' ? 409 : 503, { error: error.message }); }
  });
}

async function main() {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production' || !process.argv.includes('--local-development')) {
    throw new Error('Controller chỉ dùng trên Windows local qua run.bat; không chạy trong production/AWS.');
  }
  const config = localConfig();
  const logs = createLogs({ file: diagnosticFile, secrets: config.secrets });
  const token = randomBytes(32).toString('hex');
  const manager = createStackManager(config, logs);
  const failure = async (error) => {
    logs.add('controller', 'ERROR', error.message, 'transition');
    await notifyFailure('Không dừng được tất cả dịch vụ. Controller vẫn chạy để bạn thử lại.', diagnosticFile).catch(() => {});
  };
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    logs.add('controller', 'INFO', 'Đã dừng các dịch vụ được quản lý. Controller thoát cuối cùng.', 'transition');
    await new Promise((resolve) => server.close(resolve));
    await rm(runtimeFile, { force: true });
  }
  const server = createController(manager, token, controllerPort, close, failure);
  server.requestTimeout = 900_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(controllerPort, '127.0.0.1', resolve); });
  try {
    await mkdir(runtimeDir, { recursive: true });
    const temporary = `${runtimeFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 2, projectId, token, pid: process.pid }), { mode: 0o600 });
    await rename(temporary, runtimeFile);
  } catch (error) { server.close(); await rm(`${runtimeFile}.${process.pid}.tmp`, { force: true }).catch(() => {}); throw error; }
  logs.add('controller', 'INFO', 'Controller local sẵn sàng trên 127.0.0.1:3001.', 'transition');
  const signal = async () => {
    try {
      while (manager.status().busy) await delay(200);
      await manager.execute('stop-all'); await close();
    } catch (error) { await failure(error); }
  };
  process.on('SIGINT', () => { void signal(); });
  process.on('SIGTERM', () => { void signal(); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
