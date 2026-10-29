import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceMonitor } from "./serviceStatus";

const ok = (data: unknown) => new Response(JSON.stringify({ data }));
function healthy(path: string) {
  return Promise.resolve(ok(path.endsWith("/ready") ? { checks: { database: "ok", storage: "ok" } } : { status: "ok" }));
}
afterEach(() => { vi.useRealTimers(); });

describe("service connectivity", () => {
  it("deduplicates checks and moves Offline → Reconnecting → Online without replaying API mutations", async () => {
    let connected = false;
    const fetcher = vi.fn((path: string) => connected ? healthy(path) : Promise.reject(new TypeError("network")));
    vi.stubGlobal("fetch", fetcher);
    const monitor = createServiceMonitor(true);
    const states: string[] = [];
    const unsubscribe = monitor.subscribe(() => states.push(monitor.getSnapshot().state));
    await monitor.check();
    expect(monitor.getSnapshot().state).toBe("offline");
    connected = true;
    const first = monitor.check(true);
    const second = monitor.check(true);
    expect(first).toBe(second);
    expect(monitor.getSnapshot().state).toBe("reconnecting");
    await first;
    expect(states).toEqual(["offline", "reconnecting", "online"]);
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(["/api/health", "/api/health", "/api/health/ready"]);
    expect(monitor.getSnapshot().events.every((event) => !Number.isNaN(Date.parse(event.at)))).toBe(true);
    unsubscribe();
  });
  it.each(["database", "storage"])("maps readiness %s failure to Degraded and preserves the other dependency", async (field) => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/ready")
      ? new Response(JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", details: [{ field, issue: "UNAVAILABLE" }] } }), { status: 503 })
      : ok({ status: "ok" })));
    const monitor = createServiceMonitor(true);
    await monitor.check(true);
    expect(monitor.getSnapshot()).toMatchObject({ state: "degraded", [field]: "unavailable", [field === "database" ? "storage" : "database"]: "ok" });
  });
  it("does not let a stale health response overwrite a local Stop; Start resumes checking", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const monitor = createServiceMonitor(true);
    const pending = monitor.check(true);
    monitor.beginControl(false);
    resolve(ok({ status: "ok" }));
    await pending;
    expect(monitor.getSnapshot().state).toBe("offline");
    vi.stubGlobal("fetch", vi.fn(healthy));
    monitor.endControl(true);
    await monitor.check();
    expect(monitor.getSnapshot().state).toBe("online");
  });
  it("polls every 12 seconds in development and cleans up subscriptions", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(healthy);
    vi.stubGlobal("fetch", fetcher);
    const monitor = createServiceMonitor(true);
    const unsubscribe = monitor.subscribe(() => {});
    await monitor.check();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(24_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("has no continuous production polling, but reacts to request failure and focus", async () => {
    vi.useFakeTimers();
    let connected = true;
    const fetcher = vi.fn((path: string) => connected ? healthy(path) : Promise.reject(new TypeError("network")));
    vi.stubGlobal("fetch", fetcher);
    const monitor = createServiceMonitor(false);
    const unsubscribe = monitor.subscribe(() => {});
    await monitor.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    connected = false;
    window.dispatchEvent(new Event("api:connection-failure"));
    await vi.advanceTimersByTimeAsync(1);
    expect(monitor.getSnapshot().state).toBe("offline");
    connected = true;
    await vi.advanceTimersByTimeAsync(2_000);
    window.dispatchEvent(new Event("focus"));
    await monitor.check();
    expect(monitor.getSnapshot().state).toBe("online");
    expect(monitor.getSnapshot().events).toEqual([]);
    connected = false;
    await monitor.check(true);
    expect(monitor.getSnapshot().state).toBe("offline");
    connected = true;
    window.dispatchEvent(new Event("online"));
    await monitor.check();
    expect(monitor.getSnapshot().state).toBe("online");
    unsubscribe();
  });
});
