/* global process, setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const portInUse = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const socket = connect({ host, port });
  const finish = (result) => { socket.destroy(); resolve(result); };
  socket.once('connect', () => finish(true));
  socket.once('error', () => finish(false));
  socket.setTimeout(500, () => finish(true));
});

// One live child handle per service. Ports and persisted PIDs never grant ownership.
export function createProcessManager({ cwd, args, port = 3000, env = process.env, name = 'backend', logs,
  ready = () => portInUse(port), startTimeout = 25_000, stopTimeout = 45_000 }) {
  let child;
  let nativePid = null;
  let state = 'stopped';
  let busy = false;
  let lastError = null;
  let expectedExit = false;
  const events = [];
  const transition = (next, message) => {
    state = next;
    events.push({ at: new Date().toISOString(), state, message });
    if (events.length > 60) events.shift();
    logs?.add(name, next === 'failed' ? 'ERROR' : 'INFO', message, 'transition');
  };
  const status = () => ({ state, pid: child?.pid ?? null, nativePid, managed: Boolean(child), port, busy, lastError, events: [...events] });
  async function stop() {
    if (!child) { if (state !== 'stopped') transition('stopped', 'Đã dừng.'); return; }
    const owned = child;
    expectedExit = true;
    transition('stopping', 'Đang dừng êm dịch vụ.');
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); owned.off('exit', done); owned.off('message', failed); };
      const done = (code) => { cleanup(); if (code === 0) resolve(); else reject(new Error(`Tiến trình dừng với mã ${code ?? 'signal'}. Xem nhật ký dịch vụ.`)); };
      const failed = (message) => { if (message?.type === 'stop-error') { cleanup(); reject(new Error(message.message)); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Dừng êm vượt thời gian chờ; vẫn giữ quyền quản lý để có thể thử lại.')); }, stopTimeout);
      owned.once('exit', done);
      owned.on('message', failed);
      if (owned.connected) owned.send('local:shutdown', (error) => { if (error && owned.exitCode === null) { cleanup(); reject(error); } });
      else { cleanup(); reject(new Error('Kênh điều khiển tiến trình đã ngắt.')); }
    });
  }
  async function start() {
    if (child) {
      if (state === 'running') return;
      throw new Error('Tiến trình còn tồn tại. Hãy dừng êm trước khi khởi động lại.');
    }
    if (await portInUse(port) || await portInUse(port, '::1')) throw new Error(`Cổng ${port} đang được tiến trình khác sử dụng. Controller không nhận quản lý hoặc dừng tiến trình đó.`);
    lastError = null;
    expectedExit = false;
    transition('starting', 'Đang khởi động dịch vụ.');
    const owned = spawn(process.execPath, args, {
      cwd, env: { ...env, NODE_ENV: 'development', PORT: String(port), SERVE_FRONTEND: 'false' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true, detached: true,
    });
    child = owned;
    logs?.capture(name, owned.stdout);
    logs?.capture(name, owned.stderr, true);
    owned.on('message', (message) => {
      if (message?.type === 'native-pid') nativePid = message.pid;
      if (message?.type === 'stop-warning') logs?.add(name, 'WARN', message.message, 'transition');
    });
    owned.once('exit', (code) => {
      if (child !== owned) return;
      child = undefined;
      nativePid = null;
      if (expectedExit) transition('stopped', `Đã dừng (mã ${code ?? 'signal'}).`);
      else { lastError = `Dịch vụ dừng ngoài dự kiến (mã ${code ?? 'signal'}). Dùng Start All để khôi phục.`; transition('failed', lastError); }
    });
    owned.once('error', (error) => {
      child = undefined;
      lastError = logs?.redact(error.message) ?? error.message;
      transition('failed', lastError);
    });
    const deadline = Date.now() + startTimeout;
    while (Date.now() < deadline) {
      if (child !== owned) throw new Error(lastError ?? 'Tiến trình thoát khi khởi động.');
      if (await ready()) {
        if (child !== owned || owned.exitCode !== null) throw new Error(lastError ?? 'Tiến trình đã thoát trong lúc kiểm tra khởi động.');
        transition('running', 'Dịch vụ đang chạy.'); return;
      }
      await delay(200);
    }
    await stop();
    throw new Error('Dịch vụ không sẵn sàng trong thời gian chờ. Xem nhật ký.');
  }
  return {
    status,
    async execute(action) {
      if (busy) throw new Error('BUSY');
      busy = true;
      try {
        if (action === 'stop' || action === 'restart') await stop();
        if (action === 'start' || action === 'restart') await start();
        return status();
      } catch (error) {
        lastError = logs?.redact(error.message) ?? error.message;
        transition('failed', lastError);
        throw error;
      } finally { busy = false; }
    },
  };
}
