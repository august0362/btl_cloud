/* global process, console, fetch, AbortSignal */
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root, runtimeDir, runtimeFile, diagnosticFile, projectId, localConfig } from './local-config.mjs';
import { createLogs } from './logs.mjs';
import { notifyFailure, openBrowser } from './commands.mjs';
import { origin } from './controller.mjs';
import { acquireLauncherLock } from './launcher-lock.mjs';

const action = process.argv.find((item) => ['start', 'stop', 'restart', 'status'].includes(item.toLowerCase()))?.toLowerCase() ?? 'start';
const lockFile = join(runtimeDir, 'launcher.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function credentials() {
  const saved = JSON.parse(await readFile(runtimeFile, 'utf8'));
  if (saved.version !== 2 || saved.projectId !== projectId || !/^[a-f0-9]{64}$/.test(saved.token)) {
    throw new Error('Controller cũ hoặc khác dự án còn chạy. Hãy dừng phiên cũ trước khi dùng launcher mới.');
  }
  return saved;
}
async function request(path, method = 'POST', timeout = 900_000) {
  const saved = await credentials();
  const response = await fetch(`http://127.0.0.1:3001/${path}`, {
    method, headers: { Origin: origin, Authorization: `Bearer ${saved.token}`, 'X-Local-Control': '1' },
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Controller chưa sẵn sàng.');
  return payload;
}
async function current() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await request('status', 'GET', 2000); }
    catch (error) {
      if (error.code === 'ENOENT' || error.cause?.code === 'ECONNREFUSED') return null;
      // A keep-alive status request can race the controller's final close.
      if (['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code) && attempt < 2) { await delay(100); continue; }
      throw error;
    }
  }
}
async function startController() {
  const bootLog = join(runtimeDir, 'controller-boot.log');
  try { if ((await stat(bootLog)).size > 2 * 1024 * 1024) writeFileSync(bootLog, ''); } catch { /* New file. */ }
  const fd = openSync(bootLog, 'a');
  const child = spawn(process.execPath, [join(root, 'backend/dev/controller.mjs'), '--local-development'], {
    cwd: root, env: { ...process.env, NODE_ENV: 'development' }, windowsHide: true,
    detached: true, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  let error;
  child.once('error', (failure) => { error = failure; });
  child.unref();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (error || child.exitCode !== null) throw error ?? new Error('Controller không khởi động được. Xem controller-boot.log.');
    // A crashed controller may have left its old token file behind. Wait for
    // this newly spawned process to publish its own credentials atomically.
    let saved;
    try { saved = await credentials(); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
    if (saved?.pid === child.pid && await current()) return;
    await delay(200);
  }
  throw new Error('Controller không lên sau 20 giây; cổng 3001 có thể đang được sử dụng.');
}
async function stopAll() {
  const status = await current();
  if (!status) return;
  const saved = await credentials();
  const deadline = Date.now() + 180_000;
  while ((await current())?.busy) {
    if (Date.now() > deadline) throw new Error('Có thao tác đang chạy; chưa dừng được toàn bộ.');
    await delay(500);
  }
  await request('stop-all');
  while (Date.now() < deadline) {
    const status = await current();
    if (!status) { console.log('Đã dừng toàn bộ dịch vụ được quản lý. Dữ liệu vẫn được giữ.'); return; }
    if (!status.busy && status.lastError) throw new Error(status.lastError);
    if (!alive(saved.pid)) return;
    await delay(300);
  }
  throw new Error('Chưa dừng hết dịch vụ; controller vẫn giữ quyền quản lý. Xem nhật ký và thử lại.');
}
async function main() {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production' || !process.argv.includes('--local-development')) {
    throw new Error('Launcher chỉ dùng trên Windows development, không dùng trên AWS/production.');
  }
  await mkdir(runtimeDir, { recursive: true });
  if (action === 'status') { console.log(JSON.stringify(await current(), null, 2)); return; }
  const lock = await acquireLauncherLock(lockFile, action, projectId);
  if (!lock) { console.log('Launcher đang khởi động; không tạo phiên trùng.'); return; }
  try {
    if (action === 'stop' || action === 'restart') await stopAll();
    if (action === 'stop') return;
    localConfig(); // Refuse remote DB/storage and production settings before starting anything.
    if (!await current()) await startController();
    let failure;
    try { await request('start-all'); } catch (error) { failure = error; }
    const status = await current();
    if (status?.services?.find((service) => service.name === 'frontend')?.state === 'running') {
      await openBrowser(origin);
      if (failure) { console.error('Một dịch vụ chưa sẵn sàng. Xem Services trong web.'); process.exitCode = 1; }
      else console.log('BTL Cloud đã sẵn sàng: http://localhost:5173');
    } else throw failure ?? new Error('Không khởi động được giao diện.');
  } finally { await lock.release(); }
}
main().catch(async (error) => {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production' || !process.argv.includes('--local-development')) {
    console.error(error.message); process.exitCode = 1; return;
  }
  let secrets = [];
  try { secrets = localConfig().secrets; } catch { /* Config itself may be invalid. */ }
  const logs = createLogs({ file: diagnosticFile, secrets });
  logs.add('controller', 'ERROR', `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`, 'transition');
  console.error(logs.redact(error.message));
  await notifyFailure('BTL Cloud chưa hoàn tất thao tác. Mở nhật ký để xem lỗi và thử lại.', diagnosticFile).catch(() => {});
  process.exitCode = 1;
});
