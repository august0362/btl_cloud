import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const prohibited = /__local\/backend|local-services\.ndjson|local-controller\.json|developer-account\.json|btl_developer|DeveloperAccess|Developer Panel|Developer Mode|Start All|Stop All|ServicesPanel|LocalControls|dev\/stack-manager|native-pid/;
let checked = 0;
async function inspect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.(?:js|mjs|css|html|json)$/.test(entry.name)) {
      const contents = await readFile(file, 'utf8');
      assert.ok(!prohibited.test(contents), `Local tools leaked into production: ${file}`);
      checked++;
    }
  }
}
await inspect(join(root, 'frontend/dist'));
await inspect(join(root, 'backend/dist'));
assert.ok(checked > 5, 'Build both applications first');
process.stdout.write(`PASS: ${checked} production artifacts contain no local controls or diagnostic logs.\n`);
