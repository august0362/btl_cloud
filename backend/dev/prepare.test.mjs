/* global process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { prepareApplication } from './prepare.mjs';
import { root } from './local-config.mjs';
import { createLogs } from './logs.mjs';

for (const production of [undefined, '1']) {
  test(`startup builds both applications before migrations/storage (BTL_LOCAL_PRODUCTION=${production})`, async () => {
    const config = { env: { NODE_ENV: 'development', ...(production ? { BTL_LOCAL_PRODUCTION: production } : {}) } };
    const calls = [];
    await prepareApplication(config, createLogs(), {
      runCommand: async (file, args, options) => { calls.push({ file, args, ...options }); },
    });
    assert.deepEqual(calls.filter(({ args }) => args.includes('build')).map(({ cwd }) => cwd),
      [join(root, 'backend'), join(root, 'frontend')]);
    assert.ok(calls.slice(0, 2).every(({ file, env }) => file === process.execPath && env.NODE_ENV === 'production'));
    assert.ok(calls[2].args.includes('migrate'));
    assert.ok(calls[3].args.includes('scripts/init-storage.ts'));
    assert.equal(config.env.NODE_ENV, 'development');
  });
}

for (const folder of ['backend', 'frontend']) {
  test(`a failed ${folder} build aborts startup before migrations/storage`, async () => {
    const calls = [];
    await assert.rejects(prepareApplication({ env: {} }, createLogs(), {
      runCommand: async (_file, args, { cwd }) => {
        calls.push(args);
        if (cwd === join(root, folder)) throw new Error(`${folder} build failed`);
      },
    }), new RegExp(`${folder} build failed`));
    assert.ok(calls.every((args) => args.includes('build')));
  });
}
