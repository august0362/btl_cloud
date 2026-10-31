import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

// E1-AC-02 (XD-03): admin chỉ nằm trên máy owner. Chạy sau `npm run build`.
const root = fileURLToPath(new URL('../..', import.meta.url));
const adminDirs = ['backend/admin/', 'frontend/src/admin/', 'frontend/admin-tests/'];
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

const leakedPaths = tracked.filter((file) => adminDirs.some((dir) => file.startsWith(dir)));
assert.deepEqual(leakedPaths, [], `Admin files are tracked by Git: ${leakedPaths.join(', ')}`);

// Mã commit không bao giờ import admin: controller chỉ spawn, frontend chỉ import.meta.glob.
const importsAdmin = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*\/admin\//;
const sources = tracked.filter((file) => /^(backend\/(src|dev)|frontend\/(src|dev))\/.*\.(?:[cm]?[jt]sx?)$/.test(file));
for (const file of sources) {
  assert.ok(!importsAdmin.test(await readFile(join(root, file), 'utf8')), `Committed file imports admin code: ${file}`);
}

const markers = /Quản trị local|AdminApp|DeveloperAccess/;
let artifacts = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.(?:js|css|html)$/.test(entry.name)) {
      assert.ok(!markers.test(await readFile(file, 'utf8')), `Admin code leaked into build: ${file}`);
      artifacts++;
    }
  }
}
await inspect(join(root, 'frontend/dist'));
assert.ok(artifacts > 0, 'Build the frontend first (npm run build)');
process.stdout.write(`PASS: no tracked admin files; ${sources.length} committed sources do not import admin; ${artifacts} build artifacts are admin-free.\n`);
