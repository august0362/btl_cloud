/* global process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, URL } from 'node:url';
import { command } from './commands.mjs';

test('production refuses both launcher and controller entrypoints before starting processes', async () => {
  for (const file of ['launcher.mjs', 'controller.mjs']) {
    await assert.rejects(command(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), '--local-development'], {
      env: { ...process.env, NODE_ENV: 'production', BTL_LOCAL_NO_NOTIFY: '1' }, timeout: 10_000,
    }), /production|AWS/);
  }
});
