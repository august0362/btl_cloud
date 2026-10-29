import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { developerCredentials, loginDeveloper } from "./developer";

async function ensureBackend(page: Page) {
  await loginDeveloper(page);
  await expect.poll(async () => {
    const response = await page.request.get("/__local/backend/status");
    return response.ok() && !(await response.json()).busy;
  }, { timeout: 40_000 }).toBe(true);
  const response = await page.request.post("/__local/backend/start", { headers: { Origin: "http://localhost:5173", "X-Local-Control": "1" } });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => { await ensureBackend(page); });

test("Vite bridge rejects cross-origin/unprotected writes and never serves the controller capability", async ({ request }) => {
  const rejectedHeaders: Record<string, string>[] = [{ Origin: "http://evil.test", "X-Local-Control": "1" }, { Origin: "http://localhost:5173" }];
  for (const headers of rejectedHeaders) {
    const response = await request.post("/__local/backend/stop", { headers });
    expect(response.status()).toBe(403);
  }
  for (const file of ["local-controller.json", "developer-account.json"]) {
    const tokenPath = fileURLToPath(new URL(`../../backend/tmp/${file}`, import.meta.url)).replaceAll("\\", "/");
    const response = await request.get(`/@fs/${encodeURI(tokenPath)}`);
    expect(response.status()).toBe(403);
  }
  expect((await request.get("/__local/backend/status")).status()).toBe(401);
  for (const action of ["start", "stop", "restart", "start-all", "stop-all"]) {
    expect((await request.post(`/__local/backend/${action}`, { headers: { Origin: "http://localhost:5173", "X-Local-Control": "1" } })).status()).toBe(401);
  }
});

test("developer login protects every local tool and logout revokes control access", async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => localStorage.setItem("developer-mode", "true"));
  await page.goto("/login");
  await page.getByText("Đăng nhập nhà phát triển", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toHaveCount(0);
  await expect(page.getByText("Services · Dịch vụ cục bộ", { exact: true })).toHaveCount(0);
  const credentials = developerCredentials();
  await page.getByLabel("Tài khoản nhà phát triển *").fill(credentials.username);
  await page.getByLabel("Mật khẩu nhà phát triển *", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Mở công cụ phát triển" }).click();
  await expect(page.getByRole("alert")).toHaveText("Tài khoản hoặc mật khẩu không đúng.");
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toHaveCount(0);
  await page.getByLabel("Mật khẩu nhà phát triển *", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Mở công cụ phát triển" }).click();
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Đăng xuất nhà phát triển" }).click();
  await expect(page.getByRole("switch", { name: "Backend", exact: true })).toHaveCount(0);
  expect((await page.request.get("/__local/backend/status")).status()).toBe(401);
});

test("real Express Stop → Offline → Start → Reconnecting → Online; independent switches preserve drafts", async ({ page }) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/")) mutations.push(request.url());
  });
  await page.goto("/login");
  const backend = page.getByRole("switch", { name: "Backend", exact: true });
  const developer = page.getByRole("switch", { name: "Developer Mode" });
  await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible();
  await expect(backend).toBeEnabled();
  await developer.uncheck();
  await page.getByLabel("Email *").fill("ban-nhap@example.test");
  await page.getByLabel("Mật khẩu *", { exact: true }).fill("BanNhapChuaGui123!");
  const observed: string[] = [];
  await page.exposeFunction("recordServiceState", (state: string) => { observed.push(state); });
  await page.evaluate(() => {
    const indicator = document.querySelector("[aria-label^='Kết nối:']");
    if (!indicator) throw new Error("Missing status indicator");
    new MutationObserver(() => {
      const record = (window as unknown as { recordServiceState: (state: string) => void }).recordServiceState;
      record(indicator.getAttribute("data-state") ?? "");
    }).observe(indicator, { attributes: true, attributeFilter: ["data-state"] });
  });
  try {
    await backend.uncheck();
    await expect(page.getByLabel("Kết nối: Ngoại tuyến", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeDisabled();
    await expect(backend).toBeEnabled({ timeout: 40_000 });
    await expect(developer).not.toBeChecked();
    await expect(page.getByRole("tab", { name: "Status" })).toHaveCount(0);
    await expect(page.getByLabel("Email *")).toHaveValue("ban-nhap@example.test");
    await page.getByRole("button", { name: "Đăng xuất nhà phát triển" }).click();
    await expect(backend).toHaveCount(0);
    await page.getByText("Đăng nhập nhà phát triển", { exact: true }).click();
    const credentials = developerCredentials();
    await page.getByLabel("Tài khoản nhà phát triển *").fill(credentials.username);
    await page.getByLabel("Mật khẩu nhà phát triển *", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Mở công cụ phát triển" }).click();
    await expect(backend).toBeEnabled();
    await expect(backend).not.toBeChecked();
    await backend.check();
    await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Mật khẩu *", { exact: true })).toHaveValue("BanNhapChuaGui123!");
    await developer.check();
    await expect(page.getByRole("tab", { name: "Status" })).toBeVisible();
    await expect(page.getByText("MySQL: Sẵn sàng · SeaweedFS/S3: Sẵn sàng", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Khởi động lại", exact: true }).click();
    await expect(page.getByLabel("Kết nối: Trực tuyến", { exact: true })).toBeVisible({ timeout: 30_000 });
    await developer.uncheck();
    await expect(backend).toBeChecked();
    expect(observed).toContain("offline");
    expect(observed).toContain("reconnecting");
    expect(observed).toContain("online");
    expect(mutations).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    // Leave the user's backend running, even if an assertion failed.
    await ensureBackend(page);
  }
});

for (const field of ["database", "storage"] as const) {
  test(`readiness ${field} failure → Degraded, healthy dependency stays visible (injected readiness response)`, async ({ page }) => {
    await page.route("**/api/health/ready", (route) => route.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", details: [{ field, issue: "UNAVAILABLE" }] } }),
    }));
    await page.goto("/");
    await expect(page.getByLabel("Kết nối: Hoạt động hạn chế", { exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "Developer Mode" }).check();
    await expect(page.getByText(field === "database"
      ? "MySQL: Chưa sẵn sàng · SeaweedFS/S3: Sẵn sàng"
      : "MySQL: Sẵn sàng · SeaweedFS/S3: Chưa sẵn sàng", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Khám phá tài liệu học tập" })).toBeVisible();
  });
}
