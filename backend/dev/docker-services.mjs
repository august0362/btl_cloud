/* global setInterval, clearInterval */
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { command } from './commands.mjs';
import { root, runtimeDir, projectId } from './local-config.mjs';

// Container IDs are stable identities. Only IDs created by this launcher and still
// bearing this project's Compose working-directory label can be stopped.
export function createDockerService(name, port, config, logs, run = command, followLogs = true) {
  const ledgerFile = join(config.runtimeDir ?? runtimeDir, `docker-${name}.json`);
  let state = 'stopped';
  let id = null;
  let managed = false;
  let lastError = null;
  let follower;
  let monitor;
  let revision = 0;
  const compose = ['compose', '--project-directory', root, '-p', config.composeProject, '-f', join(root, 'docker-compose.yml')];
  const inspect = async (container) => {
    const data = JSON.parse(await run('docker', ['inspect', container], { quiet: true }))[0];
    const labels = data.Config?.Labels ?? {};
    if (labels['com.docker.compose.project'] !== config.composeProject ||
        labels['com.docker.compose.service'] !== name ||
        labels['com.docker.compose.project.working_dir']?.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase() !== root.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()) {
      throw new Error('Container không thuộc thư mục dự án này; từ chối điều khiển.');
    }
    return data;
  };
  async function refresh() {
    if (!id) return;
    const current = revision;
    try {
      const data = await inspect(id);
      if (current !== revision) return;
      const health = data.State.Health?.Status;
      const next = !data.State.Running || health === 'unhealthy' ? 'failed' : health === 'starting' ? 'starting' : 'running';
      if (next !== state && state !== 'stopping') {
        state = next;
        lastError = next === 'failed' ? 'Container dừng ngoài dự kiến hoặc không sẵn sàng. Dùng Start All để khôi phục.' : null;
        logs.add(name, next === 'failed' ? 'ERROR' : 'INFO', lastError ?? 'Container đã sẵn sàng.', 'transition');
      }
    } catch (error) {
      if (current !== revision) return;
      const message = logs.redact(error.message);
      if (state !== 'failed' || lastError !== message) logs.add(name, 'ERROR', message, 'transition');
      state = 'failed'; lastError = message;
    }
  }
  function follow() {
    if (!followLogs) return;
    follower?.kill();
    follower = spawn('docker', ['logs', '--follow', '--tail', '30', id], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    logs.capture(name, follower.stdout); logs.capture(name, follower.stderr, true);
    follower.on('error', (error) => logs.add(name, 'WARN', error.message));
    clearInterval(monitor);
    monitor = setInterval(() => { void refresh(); }, 5_000);
    monitor.unref();
  }
  return {
    status: () => ({ state, port, pid: null, containerId: id, managed, lastError, events: [] }),
    refresh,
    async execute(action) {
      revision++;
      try {
        if (action === 'stop') {
          clearInterval(monitor);
          if (managed && id) {
            await inspect(id);
            state = 'stopping';
            await run('docker', ['stop', '--time', '30', id], { logs, service: name, timeout: 40_000 });
            state = 'stopped';
            logs.add(name, 'INFO', 'Container dự án đã dừng; volume được giữ.', 'transition');
          }
          follower?.kill(); follower = undefined;
          return;
        }
        if (state === 'running') { await refresh(); if (state === 'running') return; }
        state = 'starting'; lastError = null;
        logs.add(name, 'INFO', 'Đang khởi động dịch vụ Docker.', 'transition');
        const before = (await run('docker', [...compose, 'ps', '-aq', name], { quiet: true })).trim();
        let ledger;
        try { ledger = JSON.parse(await readFile(ledgerFile, 'utf8')); } catch { /* First run. */ }
        if (before) {
          id = before;
          const data = await inspect(id);
          managed = ledger?.projectId === projectId && ledger.id === id;
          if (!managed && !data.State.Running) throw new Error('Container có sẵn không do launcher quản lý. Hãy tự bật nó hoặc chọn portable.');
          if (managed && !data.State.Running) await run('docker', ['start', id], { logs, service: name });
        } else {
          let startupError;
          try { await run('docker', [...compose, 'up', '-d', '--no-recreate', name], { logs, service: name, timeout: 180_000 }); }
          catch (error) { startupError = error; }
          id = (await run('docker', [...compose, 'ps', '-aq', name], { quiet: true })).trim();
          if (!id) throw startupError ?? new Error('Không tạo được container.');
          await inspect(id);
          managed = true;
          await writeFile(ledgerFile, JSON.stringify({ projectId, id }), { mode: 0o600 });
          if (startupError) { follow(); throw startupError; }
        }
        follow();
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const data = await inspect(id);
          if (!data.State.Running) throw new Error('Container thoát trong lúc khởi động.');
          if (!data.State.Health || data.State.Health.Status === 'healthy') {
            state = 'running';
            logs.add(name, managed ? 'INFO' : 'WARN', managed ? 'Container đang chạy.' : 'Dùng container có sẵn; Stop All sẽ không dừng container ngoài quyền quản lý.', 'transition');
            return;
          }
          await delay(1000);
        }
        throw new Error('Container chưa sẵn sàng sau 120 giây.');
      } catch (error) { state = 'failed'; lastError = logs.redact(error.message); logs.add(name, 'ERROR', lastError, 'transition'); throw error; }
      finally { revision++; }
    },
  };
}
