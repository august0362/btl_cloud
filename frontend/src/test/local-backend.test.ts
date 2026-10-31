import { readFile } from "node:fs/promises";
import { request, type IncomingMessage, type ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { expect, it, vi } from "vitest";
import { localBackendPlugin } from "../../dev/local-backend";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));

async function middleware() {
  const use = vi.fn();
  const configure = localBackendPlugin().configureServer;
  if (typeof configure !== "function") throw new Error("Missing Vite dev middleware");
  await configure.call({} as never, { middlewares: { use } } as unknown as ViteDevServer);
  expect(use.mock.calls[0][0]).toBe("/__local/backend");
  return use.mock.calls[0][1] as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

it("rejects remote or forwarded control/diagnostic requests before reading the local capability", async () => {
  const handle = await middleware();
  for (const [peer, proxyHeaders] of [
    ["192.0.2.1", {}], ["::ffff:192.0.2.1", {}], [undefined, {}],
    ["127.0.0.1", { "x-forwarded-for": "127.0.0.1" }],
    ["::1", { forwarded: "for=192.0.2.1" }],
  ] as const) {
    for (const path of ["status", "session", "login", "logout", "start", "stop", "restart", "start-all", "stop-all"]) {
      const end = vi.fn();
      const res = { setHeader: vi.fn(), end } as unknown as ServerResponse;
      await handle({ url: `/${path}`, method: ["status", "session"].includes(path) ? "GET" : "POST",
        socket: { remoteAddress: peer }, headers: { host: "localhost:5173", origin: "http://localhost:5173",
          "x-local-control": "1", cookie: "btl_developer=forged", ...proxyHeaders },
      } as unknown as IncomingMessage, res);
      expect(res.statusCode, `${peer}: ${path}`).toBe(403);
      expect(end).toHaveBeenCalledOnce();
    }
  }
  expect(readFile).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])("preserves local access from %s without contacting real services", async (peer) => {
  vi.mocked(readFile).mockRejectedValueOnce(new Error("fixture controller offline"));
  const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
  await (await middleware())({ url: "/session", method: "GET", socket: { remoteAddress: peer },
    headers: { host: "localhost:5173" },
  } as unknown as IncomingMessage, res);
  expect(readFile).toHaveBeenCalledOnce();
  expect(res.statusCode).toBe(503);
  expect(request).not.toHaveBeenCalled();
});

it("XM-02 lets /admin/* reach the controller only as GET, or POST/PATCH with the local-control header", async () => {
  const handle = await middleware();
  const send = async (method: string, extra: Record<string, string> = {}) => {
    const res = { setHeader: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    await handle({ url: "/admin/users/u1", method, socket: { remoteAddress: "127.0.0.1" },
      headers: { host: "localhost:5173", ...extra } } as unknown as IncomingMessage, res);
    return res.statusCode;
  };
  vi.mocked(readFile).mockClear();
  for (const method of ["PATCH", "DELETE", "PUT"]) expect(await send(method, { origin: "http://localhost:5173" })).toBe(403);
  expect(readFile).not.toHaveBeenCalled();
  vi.mocked(readFile).mockRejectedValue(new Error("fixture controller offline"));
  expect(await send("GET")).toBe(503);
  expect(await send("PATCH", { origin: "http://localhost:5173", "x-local-control": "1" })).toBe(503);
  expect(readFile).toHaveBeenCalledTimes(2);
});
