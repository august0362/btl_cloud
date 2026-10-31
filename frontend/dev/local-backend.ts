import { readFile } from "node:fs/promises";
import { request } from "node:http";
import type { Plugin } from "vite";

const origin = "http://localhost:5173";
const runtimeFile = new URL("../../backend/tmp/local-controller.json", import.meta.url);

// Vite-only bridge: the random capability stays on disk/server, never in browser JS.
export function localBackendPlugin(): Plugin {
  return {
    name: "local-backend-control",
    apply: "serve",
    configResolved(config) {
      // Keep Vite's default secret-file rules and also deny the local capability file.
      config.server.fs.deny.push("**/backend/tmp/**");
    },
    configureServer(server) {
      server.middlewares.use("/__local/backend", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        const fail = (status: number, error: string) => {
          if (res.writableEnded) return;
          res.statusCode = status;
          res.end(JSON.stringify({ error }));
        };
        // XM-02: /admin/* đi tiếp tới controller; controller kiểm phiên developer rồi chuyển cho admin local.
        const admin = (req.url ?? "").startsWith("/admin/");
        const read = req.method === "GET" && (admin || ["/status", "/session"].includes(req.url ?? ""));
        const write = (req.method === "POST" && ["/login", "/logout", "/start", "/stop", "/restart", "/start-all", "/stop-all"].includes(req.url ?? "")) ||
          (admin && ["POST", "PATCH"].includes(req.method ?? ""));
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") ||
            req.headers.forwarded || req.headers["x-forwarded-for"] ||
            req.headers.host !== "localhost:5173" ||
            (req.headers.origin && req.headers.origin !== origin) ||
            (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin") ||
            (!read && !(write && req.headers.origin === origin && req.headers["x-local-control"] === "1"))) {
          fail(403, "Chỉ cho phép điều khiển từ http://localhost:5173.");
          return;
        }
        try {
          const saved = JSON.parse(await readFile(runtimeFile, "utf8")) as { token: string };
          if (!/^[a-f0-9]{64}$/.test(saved.token)) throw new Error("Invalid capability");
          const upstream = request({
            host: "127.0.0.1", port: 3001, path: `/browser${req.url}`, method: req.method,
            headers: { Origin: origin, Authorization: `Bearer ${saved.token}`, "X-Local-Control": "1",
              Cookie: req.headers.cookie ?? "", "Content-Type": "application/json" },
          }, (response) => {
            res.statusCode = response.statusCode ?? 502;
            if (response.headers["content-type"]) res.setHeader("Content-Type", response.headers["content-type"]);
            if (response.headers["set-cookie"]) res.setHeader("Set-Cookie", response.headers["set-cookie"]);
            response.pipe(res);
          });
          upstream.setTimeout(900_000, () => upstream.destroy(new Error("timeout")));
          upstream.once("error", () => fail(503, "Controller chưa sẵn sàng. Hãy chạy run.bat."));
          res.once("close", () => upstream.destroy());
          req.pipe(upstream);
        } catch { fail(503, "Controller chưa sẵn sàng. Hãy chạy run.bat."); }
      });
    },
  };
}
