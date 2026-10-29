/* global process */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, URL } from 'node:url';
import { interruptOwned } from './commands.mjs';

test('Windows hidden native console receives graceful interrupt without signaling another process', { skip: process.platform !== 'win32', timeout: 20_000 }, async () => {
  const fixture = fileURLToPath(new URL('./fixtures/native-host.mjs', import.meta.url));
  const spawnFixture = () => {
    const child = spawn(process.execPath, [fixture], { detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    return { child, info: once(child, 'message'), ready: once(child.stdout, 'data') };
  };
  const first = spawnFixture();
  const second = spawnFixture();
  try {
    await Promise.all([first.ready, second.ready]);
    const [firstNative] = await first.info;
    const [secondNative] = await second.info;
    const exited = once(first.child, 'exit');
    await interruptOwned({ pid: firstNative.pid, exitCode: null, signalCode: null }, process.execPath, firstNative.at);
    const [code] = await Promise.race([exited, new Promise((_resolve, reject) => { const timer = globalThis.setTimeout(() => reject(new Error('Fixture did not stop gracefully')), 5000); timer.unref(); })]);
    assert.equal(code, 0);
    assert.equal(second.child.exitCode, null);
    const secondExit = once(second.child, 'exit');
    await interruptOwned({ pid: secondNative.pid, exitCode: null, signalCode: null }, process.execPath, secondNative.at);
    assert.equal((await secondExit)[0], 0);
  } finally {
    // Test fixtures only, no services or persisted data.
    if (first.child.exitCode === null) first.child.kill();
    if (second.child.exitCode === null) second.child.kill();
  }
});
