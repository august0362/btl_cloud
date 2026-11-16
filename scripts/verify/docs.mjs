import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const files = ['README.md', ...await markdownFiles('docs'), ...await markdownFiles('scripts/load'), ...await markdownFiles('backend/test/fixtures')];
const failures = [];
let checked = 0;

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}

for (const file of files) {
  const source = (await readFile(join(root, file), 'utf8')).replace(/^```[^\n]*\n[\s\S]*?^```/gm, '');
  for (const match of source.matchAll(/\[[^\]]*\]\(<?([^\s)>]+)>?\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    checked++;
    if (!existsSync(resolve(root, dirname(file), decodeURIComponent(target)))) failures.push(`${file}: ${target}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`PASS: ${files.length} Markdown files, ${checked} local links.`);
