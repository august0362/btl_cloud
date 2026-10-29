import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { openBrowser } from './commands.mjs';

function browserStub(error) {
  const calls = [];
  const runCommand = async (...args) => {
    calls.push(args);
    if (error) throw error;
  };
  return { calls, runCommand };
}

test('each new Start opens the page again without depending on controller browser state', async () => {
  const browser = browserStub();
  const options = { env: {}, runCommand: browser.runCommand };
  for (let i = 0; i < 2; i++) await openBrowser('http://localhost:5173', options);
  assert.equal(browser.calls.length, 2);
  assert.deepEqual(browser.calls[0], ['rundll32.exe', ['url.dll,FileProtocolHandler', 'http://localhost:5173'], { env: {}, quiet: true, timeout: 15_000 }]);
});

test('headless applies to one invocation; the next normal Start still opens the browser', async () => {
  const browser = browserStub();
  await openBrowser('http://localhost:5173', { env: { BTL_LOCAL_NO_BROWSER: '1' }, runCommand: browser.runCommand });
  assert.equal(browser.calls.length, 0);
  await openBrowser('http://localhost:5173', { env: {}, runCommand: browser.runCommand });
  assert.equal(browser.calls.length, 1);
});

test('browser launch errors reach the launcher instead of reporting a successful open', async () => {
  const browser = browserStub(new Error('Browser handler unavailable'));
  await assert.rejects(openBrowser('http://localhost:5173', { env: {}, runCommand: browser.runCommand }), /Browser handler unavailable/);
});

test('Start waits until Windows has dispatched the URL before it exits', async () => {
  let finish;
  let completed = false;
  const dispatch = new Promise((resolve) => { finish = resolve; });
  const opening = openBrowser('http://localhost:5173', { env: {}, runCommand: () => dispatch }).then(() => { completed = true; });
  await delay(0);
  assert.equal(completed, false);
  finish();
  await opening;
  assert.equal(completed, true);
});
