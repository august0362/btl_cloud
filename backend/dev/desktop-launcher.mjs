/* global process, console, fetch, AbortSignal, Buffer */
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root, runtimeDir, runtimeFile, projectId } from './local-config.mjs';
import { acquireLauncherLock } from './launcher-lock.mjs';
import { createDesktopSessions } from './desktop-sessions.mjs';
import { command, openBrowser } from './commands.mjs';

const [role, action = 'start'] = process.argv.slice(2);
const sessionFile = join(runtimeDir, 'desktop-sessions.json');
const shareFile = join(runtimeDir, 'local-sharing.json');
async function read(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function stack() {
  const saved = await read(runtimeFile);
  if (!saved) return null;
  if (saved.projectId !== projectId) throw new Error('Controller thuộc dự án khác.');
  try {
    const response = await fetch('http://127.0.0.1:3001/status', {
      headers: { Origin: 'http://localhost:5173', Authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Không xác thực được controller hiện tại.');
    return { ...await response.json(), pid: saved.pid };
  } catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw error; }
}
async function sharing(method = 'GET') {
  const saved = await read(shareFile);
  if (!saved) return null;
  if (saved.projectId !== projectId) throw new Error('Tunnel thuộc dự án khác.');
  try {
    const response = await fetch(`http://127.0.0.1:3002/__local/sharing${method === 'POST' ? '/stop' : ''}`, {
      method, headers: { Authorization: `Bearer ${saved.token}` }, signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error('Không xác thực được tiến trình chia sẻ hiện tại.');
    await response.json();
    return saved;
  } catch (error) { if (error.cause?.code === 'ECONNREFUSED') return null; throw error; }
}
async function stopSharing() {
  if (!await sharing('POST')) return;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!await sharing()) return;
    await delay(200);
  }
  throw new Error('Tunnel chưa dừng. Thử lại stop server.bat.');
}
async function startSharing(controllerPid) {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      ready = (await fetch('http://127.0.0.1:3000/api/health/ready', { signal: AbortSignal.timeout(4000) })).ok;
    } catch { /* Allow DB/storage connections to warm up without restarting services. */ }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error('Backend/DB/storage chưa sẵn sàng. Mở admin.bat để xem Services và thử lại.');
  const previous = await sharing();
  if (previous?.url && previous.controllerPid === controllerPid) return previous;
  if (previous) await stopSharing();
  // Refresh the public bundle only when opening a new tunnel; Vite stays running.
  console.log('Đang chuẩn bị website chia sẻ...');
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await command(process.execPath, [npm, 'run', 'build'], { cwd: join(root, 'frontend'), timeout: 600_000 });
  const findCloudflared = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User'); $exe = Get-Command cloudflared -ErrorAction SilentlyContinue; if ($exe) { $exe.Source }";
  let exe = (await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', findCloudflared])).trim();
  if (!exe) {
    console.log('Đang cài cloudflared (một lần)...');
    await command('winget.exe', ['install', '--id', 'Cloudflare.cloudflared', '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements'], { timeout: 300_000 });
    exe = (await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', findCloudflared])).trim();
  }
  if (!exe) throw new Error('Không tìm thấy cloudflared. Cài cloudflared rồi chạy lại server.bat.');
  const fd = openSync(join(runtimeDir, 'tunnel.log'), 'w');
  const child = spawn(process.execPath, [join(root, 'backend/dev/share-worker.mjs'), '--local-development'], {
    cwd: root, env: { ...process.env, BTL_CLOUDFLARED_EXE: exe }, windowsHide: true, detached: true, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  let failure;
  child.once('error', (error) => { failure = error; }); child.unref();
  for (let attempt = 0; attempt < 500; attempt++) {
    if (failure || child.exitCode !== null) throw failure ?? new Error('Không tạo được tunnel. Xem backend/tmp/tunnel.log.');
    const saved = await sharing();
    if (saved?.pid === child.pid && saved.url) return saved;
    await delay(200);
  }
  await stopSharing();
  throw new Error('Chưa lấy được link chia sẻ. Xem backend/tmp/tunnel.log.');
}
async function launch(action) {
  await command(process.execPath, [join(root, 'backend/dev/launcher.mjs'), '--local-development', action, '--no-browser'], { cwd: root, timeout: 900_000 });
  if (action !== 'start') return;
  for (let attempt = 0; attempt < 4500; attempt++) {
    const status = await stack();
    if (status && !status.busy) {
      if (status.lastError || status.services.some((service) => service.state !== 'running')) throw new Error(status.lastError ?? 'Dịch vụ chưa sẵn sàng.');
      return;
    }
    await delay(200);
  }
  throw new Error('Server chưa sẵn sàng sau thời gian chờ.');
}
async function main() {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production') throw new Error('Các file .bat chỉ dùng trên Windows local.');
  if (!['admin', 'server'].includes(role) || !['start', 'stop', 'status'].includes(action) || process.argv.length > 4) {
    throw new Error('Cách dùng: admin.bat hoặc server.bat [start|stop|status].');
  }
  await mkdir(runtimeDir, { recursive: true });
  const lock = await acquireLauncherLock(join(runtimeDir, 'desktop.lock'), `${role}-${action}`, projectId);
  try {
    const sessions = createDesktopSessions({ stack, sharing, startSharing, stopSharing,
      read: () => read(sessionFile),
      write: async (state) => {
        const temp = `${sessionFile}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(state)); await rename(temp, sessionFile);
      },
      remove: () => rm(sessionFile, { force: true }),
      startStack: () => launch('start'), stopStack: () => launch('stop'),
      openAdmin: () => openBrowser('http://localhost:5173/admin'),
      copy: async (url) => {
        if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) throw new Error('Link tunnel không hợp lệ.');
        const script = `Set-Clipboard -Value '${url}'`;
        await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
      },
    });
    if (action === 'status') {
      const { state, stack: status } = await sessions.status();
      console.log(JSON.stringify({ ...state, services: status?.services.map(({ name, pid, state }) => ({ name, pid, state })), sharing: (await sharing())?.url ?? null }, null, 2));
    } else if (action === 'stop') {
      const retained = await sessions.stop(role);
      console.log(retained ? `Đã dừng chế độ ${role}; giữ dịch vụ dùng chung cho chế độ còn lại.` : 'Đã dừng server, admin và các dịch vụ. Dữ liệu vẫn được giữ.');
    } else {
      const share = await sessions.start(role);
      console.log(role === 'server' ? `LINK: ${share.url}\nĐã copy link. Dừng chia sẻ: stop server.bat.` : 'Đã mở http://localhost:5173/admin. Dừng: stop admin.bat.');
    }
  } finally { await lock.release(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
