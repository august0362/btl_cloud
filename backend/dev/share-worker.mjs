/* global process, console, setInterval, clearInterval, setTimeout */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { root, runtimeDir, runtimeFile, projectId, localConfig } from './local-config.mjs';
import { createShareSite } from './share-site.mjs';

const stateFile = join(runtimeDir, 'local-sharing.json');
let server;
let tunnel;
let timer;
let closing = false;
let url = null;
const token = randomBytes(32).toString('hex');
async function close(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  if (tunnel?.pid && tunnel.exitCode === null && tunnel.signalCode === null) {
    const exited = once(tunnel, 'exit');
    tunnel.kill(); // Only the cloudflared child owned by this worker.
    await exited;
  }
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  try {
    if (JSON.parse(await readFile(stateFile, 'utf8')).token === token) await rm(stateFile, { force: true });
  } catch (error) { if (error.code !== 'ENOENT') console.error(error.message); }
  process.exit(code);
}
async function main() {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production' || !process.argv.includes('--local-development')) {
    throw new Error('Sharing worker chỉ dùng trên Windows local, không dùng trong production/AWS.');
  }
  const config = localConfig();
  const controller = JSON.parse(await readFile(runtimeFile, 'utf8'));
  const localOrigin = config.env.ALLOWED_ORIGINS?.split(',').map((item) => item.trim()).find(Boolean) ?? 'http://localhost:5173';
  server = createShareSite({ distDir: join(root, 'frontend/dist'), token, publicOrigin: () => url, localOrigin, shutdown: () => { setTimeout(() => { void close(); }, 100); } }).listen(3002, '127.0.0.1');
  await once(server, 'listening');
  server.requestTimeout = 900_000;
  const state = { projectId, pid: process.pid, controllerPid: controller.pid, token, url: null };
  const save = async () => {
    const temp = `${stateFile}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 }); await rename(temp, stateFile);
  };
  await save();
  tunnel = spawn(process.env.BTL_CLOUDFLARED_EXE, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3002'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let registered = false;
  let published = false;
  const capture = (chunk) => {
    process.stderr.write(chunk);
    output = (output + chunk).slice(-32_000);
    const match = output.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (match) url = match[0];
    registered ||= output.includes('Registered tunnel connection');
    if (url && registered && !published) {
      published = true; state.url = url;
      void save().catch((error) => { console.error(error.message); void close(1); });
    }
  };
  tunnel.stdout.on('data', capture); tunnel.stderr.on('data', capture);
  tunnel.once('error', (error) => { console.error(error.message); void close(1); });
  tunnel.once('exit', () => { if (!closing) void close(1); });
  // Stop.vbs / Stop All must also retire the public link.
  timer = setInterval(async () => {
    try {
      const saved = JSON.parse(await readFile(runtimeFile, 'utf8'));
      if (saved.pid !== controller.pid || saved.token !== controller.token) { void close(); return; }
      process.kill(controller.pid, 0);
    } catch { void close(); }
  }, 2000);
  setTimeout(() => { if (!published) { console.error('Tunnel chưa sẵn sàng sau 90 giây.'); void close(1); } }, 90_000).unref();
  process.on('SIGTERM', () => { void close(); }); process.on('SIGINT', () => { void close(); });
}
main().catch((error) => { console.error(error.message); void close(1); });
