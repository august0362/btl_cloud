/* global fetch, AbortSignal */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createProcessManager, portInUse } from './process-manager.mjs';
import { createDockerService } from './docker-services.mjs';
import { command } from './commands.mjs';
import { backendDir } from './local-config.mjs';
import { prepareDependencies, preparePortable, prepareApplication, initDatabase } from './prepare.mjs';

async function httpReady(url, expected) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return expected ? response.ok && (await response.json()).data?.status === expected : response.ok;
  } catch { return false; }
}
export function createStackManager(config, logs, overrides = {}) {
  let mode = 'portable';
  let pending;
  let operation = null;
  let lastError = null;
  let initialized = false;
  let applicationPrepared = false;
  const services = {};
  const adapters = overrides.adapters;
  const prepare = overrides.prepareDependencies ?? (() => prepareDependencies(config, logs));
  const setup = overrides.prepareApplication ?? (() => prepareApplication(config, logs));
  // XM-02: admin (gitignore) chỉ được spawn, không import. Token sinh mỗi lần chạy controller.
  const adminInstalled = adapters ? Boolean(adapters.admin) : existsSync(join(backendDir, 'admin', 'main.ts'));
  const adminToken = overrides.adminToken ?? randomBytes(32).toString('hex');
  const native = (name, port, ready, timeout, env = {}) => createProcessManager({
    name, port, cwd: backendDir, logs, ready, startTimeout: timeout,
    env: { ...config.env, BTL_LOCAL_SERVICE: name, ...env },
    args: name === 'backend' ? ['--env-file-if-exists=.env', ...(config.env.BTL_LOCAL_PRODUCTION === '1' ? [] : ['--import', 'tsx']), 'dev/express-child.mjs']
      : name === 'admin' ? ['--import', 'tsx', 'admin/main.ts'] : ['dev/service-child.mjs'],
  });
  services.backend = adapters?.backend ?? native('backend', 3000, () => httpReady('http://127.0.0.1:3000/api/health', 'ok'), 30_000,
    { BTL_LOCAL_METRICS_FILE: join(backendDir, 'tmp', 'metrics-snapshot.json') });
  services.frontend = adapters?.frontend ?? native('frontend', 5173, () => httpReady('http://localhost:5173'), 30_000);
  async function configureInfrastructure() {
    if (initialized) return;
    await prepare();
    if (adapters) { services.mysql = adapters.mysql; services.seaweedfs = adapters.seaweedfs; services.admin = adapters.admin; initialized = true; return; }
    if (config.env.BTL_LOCAL_MODE === 'docker') mode = 'docker';
    else if (config.env.BTL_LOCAL_MODE !== 'portable') {
      try { await command('docker', ['info', '--format', '{{.ServerVersion}}'], { quiet: true, timeout: 5000 }); mode = 'docker'; } catch { mode = 'portable'; }
    }
    if (mode === 'docker') {
      services.mysql = createDockerService('mysql', 3306, config, logs);
      services.seaweedfs = createDockerService('seaweedfs', 9000, config, logs);
    } else {
      await preparePortable(config, logs);
      services.mysql = native('mysql', 3306, () => portInUse(3306), 60_000);
      services.seaweedfs = native('seaweedfs', 9000, async () => {
        try { return (await fetch('http://127.0.0.1:9000', { signal: AbortSignal.timeout(2000) })).status < 500; } catch { return false; }
      }, 90_000);
    }
    if (adminInstalled) services.admin = native('admin', 3003, () => portInUse(3003), 30_000, { ADMIN_LOCAL_TOKEN: adminToken, BTL_LOCAL_MODE: mode });
    initialized = true;
  }
  const missing = (name, port) => ({ name, port, state: 'stopped', pid: null, managed: false, lastError: null });
  function status() {
    const backend = services.backend.status();
    return { ...backend, busy: Boolean(pending), lastError: lastError ?? backend.lastError, operation, mode,
      services: ['frontend', 'backend', 'mysql', 'seaweedfs'].map((name) => ({ name, ...(services[name]?.status() ?? missing(name, name === 'mysql' ? 3306 : 9000)) })),
      admin: services.admin?.status() ?? { state: adminInstalled ? 'stopped' : 'not-installed', port: 3003 },
      logs: logs.snapshot(), logError: logs.diskError(), version: 2 };
  }
  function admin() {
    return { installed: adminInstalled, running: services.admin?.status().state === 'running', token: adminToken, port: 3003 };
  }
  async function startAll() {
    const errors = [];
    try { await configureInfrastructure(); } catch (error) { errors.push(error.message); }
    for (const name of ['mysql', 'seaweedfs']) {
      if (!services[name]) continue;
      try { await services[name].execute('start'); } catch (error) { errors.push(`${name}: ${error.message}`); }
    }
    if (!errors.length) {
      try {
        if (!applicationPrepared) {
          if (mode === 'portable' && !adapters && services.mysql.status().managed) await initDatabase(config, logs);
          await setup();
          applicationPrepared = true;
        }
        await services.backend.execute('start');
      } catch (error) { errors.push(error.message); }
    }
    // Even if an infrastructure service failed, make diagnostics available in Vite.
    try { await services.frontend.execute('start'); } catch (error) { errors.push(error.message); }
    // Admin không phụ thuộc backend (E1-AC-06); thiếu thư mục admin thì bỏ qua.
    if (services.admin) {
      try { await services.admin.execute('start'); } catch (error) { errors.push(`admin: ${error.message}`); }
    }
    if (errors.length) throw new Error(errors.join(' '));
  }
  async function stopAll() {
    const errors = [];
    for (const name of ['admin', 'backend', 'frontend', 'seaweedfs', 'mysql']) {
      try { await services[name]?.execute('stop'); } catch (error) { errors.push(`${name}: ${error.message}`); }
    }
    if (errors.length) throw new Error(errors.join(' '));
  }
  return {
    status,
    admin,
    execute(action) {
      if (pending) return action === operation && action === 'start-all' ? pending : Promise.reject(new Error('BUSY'));
      operation = action; lastError = null;
      logs.add('controller', 'INFO', `Thao tác local: ${action}.`, 'transition');
      pending = (async () => {
        if (action === 'start-all') await startAll();
        else if (action === 'stop-all') await stopAll();
        else await services.backend.execute(action);
      })().catch((error) => {
        lastError = logs.redact(error.message);
        logs.add('controller', 'ERROR', lastError, 'transition');
        throw error;
      }).finally(() => { pending = undefined; operation = null; });
      return pending;
    },
  };
}
