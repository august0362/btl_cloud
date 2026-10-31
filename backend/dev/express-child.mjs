/* global process, setInterval, clearInterval */
// This development entrypoint is outside src/ and never emitted by tsc.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const production = process.env.NODE_ENV === 'production';
const metricsFile = process.env.BTL_LOCAL_METRICS_FILE ? resolve(process.env.BTL_LOCAL_METRICS_FILE) : null;
let metricsTimer;
let shutdownRequested = false;
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});
function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  clearInterval(metricsTimer);
  // server.ts performs async initialization before registering its signal handlers.
  const timer = setInterval(() => {
    if (process.listenerCount('SIGTERM') > 0) {
      clearInterval(timer);
      process.emit('SIGTERM');
    }
  }, 20);
}
process.on('message', (message) => { if (message === 'local:shutdown') shutdown(); });
process.on('disconnect', shutdown);
await import(production ? '../dist/server.js' : '../src/server.ts');

// XD-04: snapshot số liệu (XM-05) cho admin local mỗi 5 s, chỉ khi controller truyền BTL_LOCAL_METRICS_FILE.
// Ghi file tạm rồi đổi tên để admin không đọc phải JSON dở; ghi lỗi → bỏ qua lượt đó.
if (metricsFile) {
  const { getMetricsSnapshot } = await import(production ? '../dist/metrics/metrics.js' : '../src/metrics/metrics.ts');
  const temporary = `${metricsFile}.${process.pid}.tmp`;
  const writeSnapshot = async () => {
    try {
      await mkdir(dirname(metricsFile), { recursive: true });
      await writeFile(temporary, JSON.stringify(getMetricsSnapshot()));
      await rename(temporary, metricsFile);
    } catch {
      // bỏ qua lượt này
    }
  };
  metricsTimer = setInterval(() => { void writeSnapshot(); }, 5_000);
  metricsTimer.unref();
}
