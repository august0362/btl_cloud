/* global process */
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { devNull } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
const fd = openSync(devNull, 'r');
const startedAt = Date.now();
const native = spawn(process.execPath, [fileURLToPath(new URL('./console.mjs', import.meta.url))], { windowsHide: true, stdio: [fd, 'pipe', 'pipe'] });
closeSync(fd);
native.stdout.pipe(process.stdout);
native.stderr.pipe(process.stderr);
process.send({ pid: native.pid, at: startedAt });
native.on('exit', (code) => process.exit(code ?? 1));
process.on('disconnect', () => native.kill());
