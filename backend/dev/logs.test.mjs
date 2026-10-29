/* global Buffer */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, stat, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogs } from './logs.mjs';

test('log buffer is bounded, strips terminal escapes and redacts credentials', () => {
  const logs = createLogs({ limit: 3, secrets: ['very-secret-value'] });
  for (let i = 0; i < 10; i++) logs.add('backend', 'INFO', `\u001b[31m${i} very-secret-value mysql://user:pass@localhost/db {"cookie":"sid=secret"}`);
  assert.equal(logs.snapshot().length, 3);
  assert.equal(logs.snapshot()[0].id, 8);
  const text = JSON.stringify(logs.snapshot());
  assert.ok(!text.includes('very-secret-value') && !text.includes('sid=secret') && !text.includes('user:pass@'));
  assert.ok(!text.includes('001b'));
});
test('stdout/stderr capture handles split UTF-8 lines and limits oversized chunks', async () => {
  const logs = createLogs();
  const stream = new PassThrough(); logs.capture('frontend', stream);
  const bytes = Buffer.from('Tệp tiếng Việt\n');
  stream.write(bytes.subarray(0, 2)); stream.write(bytes.subarray(2));
  stream.write('x'.repeat(100_000)); stream.end();
  await new Promise((resolve) => stream.once('end', resolve));
  assert.equal(logs.snapshot()[0].message, 'Tệp tiếng Việt');
  assert.ok(logs.snapshot().every((entry) => entry.message.length <= 2000));
});
test('local diagnostic files rotate and remain bounded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'btl-log-test-'));
  const file = join(dir, 'logs.ndjson');
  try {
    const logs = createLogs({ file, maxBytes: 1024 });
    for (let index = 0; index < 20; index++) logs.add('mysql', 'WARN', 'x'.repeat(800));
    assert.ok((await stat(file)).size < 2048);
    assert.ok((await stat(`${file}.1`)).size < 2048);
    assert.ok((await readFile(file, 'utf8')).includes('mysql'));
  } finally { await rm(file, { force: true }); await rm(`${file}.1`, { force: true }); await rmdir(dir); }
});
