// Both entrypoints share the stack. Server stop shuts down both modes;
// admin stop preserves a running server.
export function createDesktopSessions(io) {
  async function current() {
    const stack = await io.stack();
    const saved = await io.read();
    const state = saved && stack && saved.controllerPid === stack.pid
      ? saved
      : { controllerPid: stack?.pid ?? null, admin: Boolean(stack), server: false };
    if (state.server && !await io.sharing()) state.server = false;
    return { stack, state };
  }
  return {
    async start(role) {
      const { state } = await current();
      await io.startStack();
      state.controllerPid = (await io.stack()).pid;
      // Keep the local stack recoverable if tunnel startup or clipboard access fails.
      if (role === 'admin') state.admin = true;
      await io.write(state);
      if (role === 'server') {
        const share = await io.startSharing(state.controllerPid);
        state.server = true;
        await io.write(state);
        await io.copy(share.url);
        return share;
      }
      await io.openAdmin();
    },
    async stop(role) {
      const { state } = await current();
      if (role === 'server') state.admin = false;
      state[role] = false;
      await io.write(state);
      if (!state.admin && !state.server) {
        await io.stopSharing();
        await io.stopStack();
        await io.remove();
        return false;
      }
      return true;
    },
    async status() { return current(); },
  };
}
