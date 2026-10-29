export type ServiceState = "online" | "degraded" | "offline" | "reconnecting";
export type Readiness = "ok" | "unavailable" | "unknown";
export interface ServiceSnapshot {
  checked: boolean;
  state: ServiceState;
  database: Readiness;
  storage: Readiness;
  events: { at: string; message: string }[];
}
export const serviceLabels: Record<ServiceState, string> = {
  online: "Trực tuyến", degraded: "Hoạt động hạn chế",
  offline: "Ngoại tuyến", reconnecting: "Đang kết nối lại",
};

export function createServiceMonitor(development: boolean) {
  let snapshot: ServiceSnapshot = { checked: false, state: "reconnecting", database: "unknown", storage: "unknown", events: [] };
  const listeners = new Set<() => void>();
  let active = false;
  let suspended = false;
  let lastCheck = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failureTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | undefined;
  let abort: AbortController | undefined;
  let generation = 0;
  function update(state: ServiceState, database: Readiness = "unknown", storage: Readiness = "unknown") {
    if (snapshot.checked && snapshot.state === state && snapshot.database === database && snapshot.storage === storage) return;
    const message = `${serviceLabels[state]} · MySQL: ${database} · SeaweedFS: ${storage}`;
    snapshot = { checked: true, state, database, storage, events: development
      ? [...snapshot.events, { at: new Date().toISOString(), message }].slice(-60) : [] };
    listeners.forEach((listener) => listener());
  }
  async function health(path: string, signal: AbortSignal) {
    const response = await fetch(path, {
      cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
    });
    const payload = await response.json();
    return { response, payload };
  }
  function schedule() {
    clearTimeout(timer);
    // Production has no timer: only request failures, recovery responses, focus, or Retry.
    if (active && development) timer = setTimeout(() => {
      if (document.visibilityState === "visible") void check();
      else schedule();
    }, 12_000);
  }
  function check(force = false): Promise<void> {
    if (suspended) return Promise.resolve();
    if (pending) return pending;
    if (!force && Date.now() - lastCheck < 2_000) return Promise.resolve();
    lastCheck = Date.now();
    const current = ++generation;
    const controller = new AbortController();
    abort = controller;
    if (snapshot.state === "offline") update("reconnecting");
    const alive = async () => {
      const { response, payload } = await health("/api/health", controller.signal);
      if (!response.ok || payload?.data?.status !== "ok") throw new Error("unreachable");
    };
    pending = (async () => {
      try {
        await alive();
        if (current !== generation) return;
        try {
          const { response, payload } = await health("/api/health/ready", controller.signal);
          if (current !== generation) return;
          if (response.ok && payload?.data?.checks?.database === "ok" && payload?.data?.checks?.storage === "ok") {
            update("online", "ok", "ok");
          } else if (response.status === 503 && payload?.error?.code === "SERVICE_UNAVAILABLE" && Array.isArray(payload.error.details)) {
            const unavailable = (field: string) => payload.error.details.some((item: { field?: string }) => item.field === field);
            update("degraded", unavailable("database") ? "unavailable" : "ok", unavailable("storage") ? "unavailable" : "ok");
          } else {
            await alive();
            if (current === generation) update("degraded");
          }
        } catch {
          // The process may have disappeared between liveness and readiness.
          await alive();
          if (current === generation) update("degraded");
        }
      } catch {
        if (current === generation && !controller.signal.aborted) update("offline");
      } finally {
        if (current === generation) { pending = undefined; schedule(); }
      }
    })();
    return pending;
  }
  function invalidate() {
    generation++;
    abort?.abort();
    pending = undefined;
    clearTimeout(timer);
    clearTimeout(failureTimer);
    failureTimer = undefined;
  }
  const failure = () => {
    if (pending || suspended || failureTimer) return;
    failureTimer = setTimeout(() => {
      failureTimer = undefined;
      void check();
    }, Math.max(0, 2_000 - (Date.now() - lastCheck)));
  };
  const success = () => { if (snapshot.state !== "online") void check(); };
  const focus = () => {
    if (document.visibilityState === "visible" && (development || snapshot.state !== "online")) void check();
  };
  const online = () => { if (snapshot.state !== "online") void check(true); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!active) {
        active = true;
        window.addEventListener("api:connection-failure", failure);
        window.addEventListener("api:connection-success", success);
        window.addEventListener("focus", focus);
        window.addEventListener("online", online);
        document.addEventListener("visibilitychange", focus);
        void check();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          active = false;
          invalidate();
          lastCheck = -Infinity;
          window.removeEventListener("api:connection-failure", failure);
          window.removeEventListener("api:connection-success", success);
          window.removeEventListener("focus", focus);
          window.removeEventListener("online", online);
          document.removeEventListener("visibilitychange", focus);
        }
      };
    },
    check,
    beginControl(reconnect: boolean) {
      invalidate();
      suspended = true;
      update(reconnect ? "reconnecting" : "offline");
    },
    endControl(reconnect: boolean) {
      suspended = false;
      if (reconnect) { update("reconnecting"); void check(true); }
      else schedule();
    },
  };
}

export const serviceMonitor = createServiceMonitor(import.meta.env.DEV);
export function backendUnavailable() {
  const snapshot = serviceMonitor.getSnapshot();
  return snapshot.checked && (snapshot.state === "offline" || snapshot.state === "reconnecting");
}
export function reportConnectionFailure() { window.dispatchEvent(new Event("api:connection-failure")); }
export function reportConnectionSuccess() { window.dispatchEvent(new Event("api:connection-success")); }
