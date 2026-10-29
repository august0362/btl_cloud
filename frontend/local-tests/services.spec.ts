import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { BackendStatus } from "../src/api/localBackend";
import { loginDeveloper } from "./developer";

test.beforeEach(async ({ page }) => { await loginDeveloper(page); });

const exec = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const portOpen = (port: number) => new Promise<boolean>((resolve) => {
  const socket = connect({ host: "127.0.0.1", port });
  socket.on("connect", () => { socket.destroy(); resolve(true); });
  socket.on("error", () => resolve(false));
  socket.setTimeout(500, () => { socket.destroy(); resolve(true); });
});
async function getStatus(page: Page): Promise<BackendStatus> {
  const response = await page.request.get("/__local/backend/status");
  expect(response.ok()).toBe(true);
  return response.json();
}
async function startThroughWindows() {
  await exec("cscript.exe", ["//nologo", fileURLToPath(new URL("../../Start.vbs", import.meta.url))], {
    cwd: projectRoot, windowsHide: true, timeout: 150_000,
    env: { ...process.env, NODE_ENV: "development", BTL_LOCAL_MODE: "portable", BTL_LOCAL_NO_BROWSER: "1", BTL_LOCAL_NO_NOTIFY: "1" },
  });
}

test("Services shows captured logs and recovers an owned backend crash without restarting dependencies", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByText("Services · Dịch vụ cục bộ", { exact: true }).click();
  await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible();
  const before = await getStatus(page);
  const backend = before.services?.find((item) => item.name === "backend");
  expect(backend?.managed).toBe(true);
  expect(backend?.state).toBe("running");
  expect(backend?.pid).toBeTruthy();
  await page.getByLabel("Email *").fill("ban-nhap-dich-vu@example.test");
  process.kill(backend!.pid!); // Exact PID returned by this project's authenticated controller, no process-name killing.
  await expect(page.locator(".toast-region")).toContainText("Backend gặp lỗi hoặc dừng ngoài dự kiến", { timeout: 15_000 });
  await page.getByRole("combobox", { name: "Lọc dịch vụ" }).selectOption("backend");
  await page.getByRole("combobox", { name: "Lọc mức log" }).selectOption("ERROR");
  await expect(page.getByLabel("Log dịch vụ")).toContainText("dừng ngoài dự kiến");
  await page.getByRole("button", { name: "Start All", exact: true }).click();
  await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible({ timeout: 30_000 });
  const after = await getStatus(page);
  expect(after.services?.find((item) => item.name === "backend")?.pid).not.toBe(backend?.pid);
  for (const name of ["frontend", "mysql", "seaweedfs"]) {
    expect(after.services?.find((item) => item.name === name)?.pid).toBe(before.services?.find((item) => item.name === name)?.pid);
  }
  await expect(page.getByLabel("Email *")).toHaveValue("ban-nhap-dich-vu@example.test");
  await page.getByRole("button", { name: "Start All", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "Start All", exact: true })).toBeEnabled({ timeout: 30_000 });
  expect((await getStatus(page)).services?.map((item) => item.pid)).toEqual(after.services?.map((item) => item.pid));
  await page.getByRole("button", { name: "Xóa log hiển thị" }).click();
  await expect(page.getByLabel("Log dịch vụ")).toBeEmpty();
});

test("Stop All confirms with Backend OFF, waits for a concurrent Start, then Start.vbs restores the stack", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/login");
  const backend = page.getByRole("switch", { name: "Backend", exact: true });
  await expect(backend).toBeEnabled();
  await page.getByRole("switch", { name: "Developer Mode" }).uncheck();
  await backend.uncheck();
  await expect(backend).toBeEnabled({ timeout: 40_000 });
  await page.getByRole("button", { name: "Stop All", exact: true }).click();
  await page.getByRole("button", { name: "Huỷ", exact: true }).click();
  expect(await portOpen(3001)).toBe(true);
  expect(await portOpen(3306)).toBe(true);
  await page.getByRole("button", { name: "Stop All", exact: true }).click();
  // Another tab/CLI can start Backend while this already-open confirmation is shown.
  const starting = page.request.post("/__local/backend/start", { headers: { Origin: "http://localhost:5173", "X-Local-Control": "1" } })
    .then((response) => response.status()).catch(() => 0);
  await expect.poll(async () => (await getStatus(page)).busy).toBe(true);
  await page.getByRole("button", { name: "Dừng tất cả", exact: true }).click();
  await expect(page.getByText(/Đang dừng toàn bộ dịch vụ được quản lý/)).toBeVisible();
  try {
    await expect.poll(async () => (await Promise.all([3000, 3001, 3306, 9000, 9333, 8888, 8080].map(portOpen))).every((open) => !open), { timeout: 80_000 }).toBe(true);
  } finally { await starting; await startThroughWindows(); }
  await loginDeveloper(page);
  await page.goto("/login");
  await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("switch", { name: "Developer Mode" })).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toBeChecked();
  const status = await getStatus(page);
  expect(status.services).toHaveLength(4);
  expect(status.services?.every((item) => item.state === "running" && item.managed)).toBe(true);
});

test("partial startup preserves an unrelated listener, saves failure diagnostics and shows one Windows notification", async ({ page }) => {
  test.setTimeout(210_000);
  await page.goto("/login");
  expect((await getStatus(page)).services?.every((item) => item.managed)).toBe(true);
  const launcher = fileURLToPath(new URL("../../backend/dev/launcher.mjs", import.meta.url));
  const env = { ...process.env, NODE_ENV: "development", BTL_LOCAL_MODE: "portable", BTL_LOCAL_NO_BROWSER: "1", BTL_LOCAL_NO_NOTIFY: "1" };
  const run = (action: string) => exec(process.execPath, [launcher, "--local-development", action], { cwd: projectRoot, windowsHide: true, env, timeout: 150_000 });
  await run("stop");
  const unrelated = createServer((_req, response) => response.end("unrelated-test-listener"));
  await new Promise<void>((resolve) => unrelated.listen(5173, "127.0.0.1", resolve));
  try {
    const notifyEnv: NodeJS.ProcessEnv = { ...env };
    delete notifyEnv.BTL_LOCAL_NO_NOTIFY;
    let outcome: { code?: string | number; stderr?: string } = {};
    const launch = exec(process.execPath, [launcher, "--local-development", "start"], { cwd: projectRoot, windowsHide: true, env: notifyEnv, timeout: 120_000 })
      .then(() => { throw new Error("Expected a port conflict failure"); }, (error) => { outcome = error; });
    await expect.poll(async () => {
      const result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "@(Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'BTL Cloud' }).Count"], { windowsHide: true });
      return result.stdout.trim();
    }, { timeout: 80_000, intervals: [1000] }).toBe("1");
    await launch; // The single Windows popup closes automatically after 15 seconds.
    expect(outcome.code).toBe(1);
    const saved = JSON.parse(await readFile(fileURLToPath(new URL("../../backend/tmp/local-controller.json", import.meta.url)), "utf8"));
    const response = await fetch("http://127.0.0.1:3001/status", { headers: { Origin: "http://localhost:5173", Authorization: `Bearer ${saved.token}` } });
    const status: BackendStatus = await response.json();
    expect(status.services?.find((item) => item.name === "frontend")).toMatchObject({ state: "failed", managed: false, pid: null });
    expect(status.logs?.some((entry) => entry.level === "ERROR" && entry.message.includes("5173"))).toBe(true);
    await run("stop");
    expect(await (await fetch("http://127.0.0.1:5173")).text()).toBe("unrelated-test-listener");
  } finally {
    await new Promise<void>((resolve) => unrelated.close(() => resolve()));
    await startThroughWindows();
  }
  await loginDeveloper(page);
  await page.goto("/login");
  await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible();
});
