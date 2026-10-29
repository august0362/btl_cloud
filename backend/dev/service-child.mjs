/* global process, console, setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { devNull } from 'node:os';
import { localConfig, root } from './local-config.mjs';
import { mysqlArgs, weedArgs } from './prepare.mjs';
import { interruptOwned, command, windowsHelper } from './commands.mjs';

const role = process.env.BTL_LOCAL_SERVICE;
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});
let stopping = false;
let shutdown = async () => {};
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await shutdown(); process.exit(0); }
  catch (error) {
    stopping = false;
    console.error('Không dừng được dịch vụ:', error.message);
    if (process.connected) process.send({ type: 'stop-error', message: error.message });
    // Stay alive with the native child handle so a subsequent Stop can retry safely.
  }
}
process.on('message', (message) => { if (message === 'local:shutdown') void stop(); });
process.on('disconnect', () => { void stop(); });

if (role === 'frontend') {
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  const server = await createServer({ root: join(root, 'frontend'), configFile: join(root, 'frontend/vite.config.ts'), mode: 'development', clearScreen: false });
  shutdown = () => server.close();
  await server.listen();
  console.log('Vite đang chạy tại http://localhost:5173.');
} else if (role === 'mysql' || role === 'seaweedfs') {
  const config = localConfig();
  const executable = role === 'mysql' ? join(config.mysqlDir, 'bin/mysqld.exe') : config.weedExe;
  // Inherited NUL fd suppresses libuv's CREATE_NO_WINDOW flag. A console-less worker
  // therefore gives the native child its own SW_HIDE console, with captured output.
  // The helper verifies every console member before delivering Ctrl+Break.
  const inputFd = openSync(devNull, 'r');
  const startedAt = Date.now();
  const native = spawn(executable, role === 'mysql' ? mysqlArgs(config) : weedArgs(config), {
    cwd: config.serviceDir, env: config.env, windowsHide: true, stdio: [inputFd, 'pipe', 'pipe'],
  });
  closeSync(inputFd);
  native.stdout.pipe(process.stdout);
  native.stderr.pipe(process.stderr);
  native.once('error', (error) => { console.error(error.message); process.exit(1); });
  native.once('exit', (code) => { if (!stopping) process.exit(code || 1); });
  if (process.connected) process.send({ type: 'native-pid', pid: native.pid });
  shutdown = async () => {
    if (native.exitCode !== null) return;
    const exited = once(native, 'exit');
    let timer;
    try {
      if (role === 'mysql') {
        // mysqladmin is graceful on Windows; console Ctrl+Break would terminate mysqld.
        // Verify the listening PID belongs to our still-live child/descendants first.
        await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsHelper,
          '-TargetProcessId', String(native.pid), '-ExpectedPath', executable, '-StartedAt', String(startedAt), '-Port', '3306']);
        if (native.exitCode !== null) return;
        await command(join(config.mysqlDir, 'bin/mysqladmin.exe'), ['--protocol=tcp', '--connect-timeout=5', '-h127.0.0.1', '-P3306', '-uroot', 'shutdown'], { env: config.env, timeout: 20_000 });
      } else await interruptOwned(native, executable, startedAt);
      let result;
      try { result = await Promise.race([exited, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Dịch vụ native chưa dừng sau 30 giây.')), 30_000); })]); }
      catch (error) {
        if (role !== 'seaweedfs' || native.exitCode !== null) throw error;
        const message = 'SeaweedFS không hoàn tất dừng êm sau 30 giây; buộc dừng đúng child đã quản lý, dữ liệu trên đĩa được giữ.';
        console.error(message);
        if (process.connected) process.send({ type: 'stop-warning', message });
        native.kill();
        await exited;
        return;
      }
      const [code] = result;
      if (code !== 0) throw new Error(`Dịch vụ native dừng với mã ${code}. Xem nhật ký.`);
    } finally { clearTimeout(timer); }
  };
} else { throw new Error('Loại dịch vụ local không hợp lệ.'); }
