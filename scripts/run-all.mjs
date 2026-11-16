#!/usr/bin/env node
// Run the same task in each application, using the npm bundled with Node.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const task = process.argv[2];
const allPackages = ['backend', 'frontend'];
const packages = process.argv[3] ? [process.argv[3]] : allPackages;
const npm = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.join(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find((file) => file && existsSync(file));

if (!['install', 'lint', 'build', 'test'].includes(task) || packages.some((name) => !allPackages.includes(name)) || process.argv.length > 4) {
  console.error('Cách dùng: node scripts/run-all.mjs <install|lint|build|test> [backend|frontend]');
  process.exit(2);
}
if (!npm) {
  console.error('Không tìm thấy npm. Cài Node.js kèm npm rồi thử lại.');
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
  const result = spawnSync(process.execPath, [npm, ...args], { cwd: dir, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) {
    console.error(`[${name}] npm ${args.join(' ')} thất bại (mã ${result.status})`);
    failed = true;
    break;
  }
}
process.exit(failed ? 1 : 0);
