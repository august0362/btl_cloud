#!/usr/bin/env node
// Chạy cùng một tác vụ cho mọi package (backend/, frontend/) đang tồn tại — ARCHITECTURE D-16.
// `install` → npm ci (có lockfile) hoặc npm install; tác vụ khác → npm run <task> --if-present.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const task = process.argv[2];
// Tham số thứ hai (tuỳ chọn) giới hạn package, ví dụ: node scripts/run-all.mjs test backend
const packages = process.argv[3] ? [process.argv[3]] : ['backend', 'frontend'];

if (!task) {
  console.error('Cách dùng: node scripts/run-all.mjs <install|lint|build|test> [backend|frontend]');
  process.exit(2);
}

let failed = false;
for (const name of packages) {
  const dir = path.join(root, name);
  if (!existsSync(path.join(dir, 'package.json'))) continue;
  const args =
    task === 'install'
      ? existsSync(path.join(dir, 'package-lock.json'))
        ? ['ci']
        : ['install']
      : ['run', task, '--if-present'];
  console.log(`\n> [${name}] npm ${args.join(' ')}`);
  const result = spawnSync('npm', args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`[${name}] npm ${args.join(' ')} thất bại (mã ${result.status})`);
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
