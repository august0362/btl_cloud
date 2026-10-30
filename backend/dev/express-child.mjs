/* global process, setInterval, clearInterval */
// This development entrypoint is outside src/ and never emitted by tsc.
let shutdownRequested = false;
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});
function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
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
await import(process.env.NODE_ENV === 'production' ? '../dist/server.js' : '../src/server.ts');
