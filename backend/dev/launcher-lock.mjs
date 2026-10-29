/* global process */
import { open, readFile, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Duplicate Start can join an existing launch. Stop/Restart must wait their turn,
// rather than claiming success without ever sending the shutdown request.
export async function acquireLauncherLock(file, action, projectId, { timeout = 900_000, pollMs = 200 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let handle;
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let text;
      let info;
      try { text = await readFile(file, 'utf8'); info = await stat(file); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      let previous;
      try { previous = JSON.parse(text); } catch { /* The first writer may not have finished. */ }
      if (previous && alive(previous.pid)) {
        if (action === 'start' && previous.projectId === projectId && ['start', 'restart'].includes(previous.action)) return null;
      } else if (previous || Date.now() - info.mtimeMs >= 10_000) {
        try { if (await readFile(file, 'utf8') === text) await rm(file); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        continue;
      }
      await delay(pollMs);
      continue;
    }
    const lease = JSON.stringify({ pid: process.pid, projectId, action, nonce: randomUUID() });
    try { await handle.writeFile(lease); }
    catch (error) { await handle.close(); await rm(file, { force: true }); throw error; }
    return {
      async release() {
        await handle.close();
        try { if (await readFile(file, 'utf8') === lease) await rm(file); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      },
    };
  }
  throw new Error('Launcher đang bận quá thời gian chờ; yêu cầu chưa được thực hiện. Hãy xem log và thử lại.');
}
