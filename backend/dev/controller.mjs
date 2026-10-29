/* global process, console, Buffer, setTimeout */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
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

export function createController(manager, token, port = controllerPort, onShutdown, onFailure = () => {}, developerAuth = createDeveloperAuth()) {
  let shuttingDown = false;
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    const auth = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (req.headers.host !== `127.0.0.1:${port || res.socket.localPort}` || req.headers.origin !== origin ||
        auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      reply(403, { error: 'Không được phép truy cập bộ điều khiển cục bộ.' }); return;
    }
    // Vite can only forward browser requests under /browser. CLI uses the on-disk capability.
    if (req.url.startsWith('/browser/')) {
      req.url = req.url.slice('/browser'.length);
      try {
        if (req.method === 'GET' && req.url === '/session') {
          reply(200, await developerAuth.status(req.headers.cookie)); return;
        }
        if (req.method === 'POST' && req.headers['x-local-control'] === '1' && req.url === '/login') {
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size <= 4096) chunks.push(chunk);
          }
          if (size > 4096) { reply(413, { error: 'Yêu cầu đăng nhập quá lớn.' }); return; }
          let input;
          try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { reply(400, { error: 'Dữ liệu đăng nhập không hợp lệ.' }); return; }
          const result = await developerAuth.login(input?.username, input?.password, req.headers.cookie);
          if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
          reply(result.status, result.error ? { error: result.error } : { user: result.user }); return;
        }
        if (req.method === 'POST' && req.headers['x-local-control'] === '1' && req.url === '/logout') {
          res.setHeader('Set-Cookie', developerAuth.logout(req.headers.cookie));
          reply(200, { user: null }); return;
        }
        if (!(await developerAuth.status(req.headers.cookie)).user) {
          reply(401, { error: 'Vui lòng đăng nhập tài khoản nhà phát triển.' }); return;
        }
      } catch { reply(503, { error: 'Không đọc được tài khoản nhà phát triển. Hãy liên hệ người quản lý dự án.' }); return; }
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
