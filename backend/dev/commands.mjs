/* global process, Buffer, setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

export function command(file, args, { cwd, env = process.env, logs, service = 'controller', input, timeout = 120_000, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    if (!quiet) { logs?.capture(service, child.stdout); logs?.capture(service, child.stderr, true); }
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-16_000); });
    child.stderr.on('data', (chunk) => { errorOutput = (errorOutput + chunk.toString()).slice(-2000); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Lệnh local vượt thời gian chờ. Xem nhật ký dịch vụ.')); }, timeout);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`Lệnh local thất bại (mã ${code ?? 'signal'}). ${logs?.redact(errorOutput) ?? errorOutput}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export const windowsHelper = fileURLToPath(new URL('./interrupt-owned.ps1', import.meta.url));
export function interruptOwned(child, executable, startedAt) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform !== 'win32') { child.kill('SIGTERM'); return Promise.resolve(); }
  return command('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsHelper,
    '-TargetProcessId', String(child.pid), '-ExpectedPath', executable, '-StartedAt', String(startedAt)], { timeout: 15_000 });
}

export async function notifyFailure(message, diagnosticPath) {
  if (process.env.BTL_LOCAL_NO_NOTIFY === '1' || process.platform !== 'win32') return;
  const text = `${message}\nNhật ký: ${diagnosticPath}`.replaceAll("'", "''");
  const script = `$shell = New-Object -ComObject WScript.Shell; $null = $shell.Popup('${text}', 15, 'BTL Cloud', 16)`;
  await command('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 20_000, quiet: true });
}
