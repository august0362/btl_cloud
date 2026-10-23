import { test, expect } from "@playwright/test";
import { pdf, register, remove, upload } from "./fixtures";

test("F-11 · abort upload and replacement against real backend", async ({ page, context }) => {
  await register(page, "abort");
  const document = await upload(page, `abort-base-${Date.now()}`, "PRIVATE");
  const slow = { ...pdf, name: "slow.pdf", buffer: Buffer.concat([pdf.buffer, Buffer.alloc(2 * 1024 * 1024, 32)]) };
  const network = await context.newCDPSession(page);
  try {
    await page.goto("/upload");
    await page.getByLabel("Tệp tài liệu *").setInputFiles(slow);
    const title = `aborted-${Date.now()}`;
    await page.getByLabel("Tiêu đề *").fill(title);
    await page.getByRole("radio", { name: /^Riêng tư/ }).check();
    await network.send("Network.enable");
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 30, downloadThroughput: -1, uploadThroughput: 8192 });
    await page.getByRole("button", { name: "Tải lên", exact: true }).click();
    await page.getByRole("button", { name: "Huỷ tải lên", exact: true }).click();
    await expect(page.getByText("Đã huỷ tải lên.", { exact: true })).toBeVisible();
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const mine = await context.request.get(`/api/documents/mine?q=${title}`);
    expect((await mine.json()).data.totalItems).toBe(0);
    await page.goto(`/documents/${document.id}/edit`);
    await page.getByLabel("Tệp tài liệu *").setInputFiles(slow);
    await page.getByRole("button", { name: "Thay thế tệp", exact: true }).click();
    await network.send("Network.emulateNetworkConditions", { offline: false, latency: 30, downloadThroughput: -1, uploadThroughput: 8192 });
    await page.getByRole("dialog").getByRole("button", { name: "Thay thế", exact: true }).click();
    await page.getByRole("button", { name: "Huỷ thay thế", exact: true }).click();
    await expect(page.getByText("Đã huỷ tải lên.", { exact: true })).toBeVisible();
    const metadata = await context.request.get(`/api/documents/${document.id}`);
    expect((await metadata.json()).data.fileVersion).toBe(1);
  } finally {
    await network.detach();
    await remove(context.request, document.id);
  }
});

test("F-17/18 · revoked session, local validation and mobile navigation", async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/login");
  const password = page.getByLabel("Mật khẩu *", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: /^Hiện mật khẩu/ }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(page.getByRole("button", { name: "Đóng menu" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await register(page, "session");
  // Revoke the actual DB session while the page still holds its identity.
  expect((await context.request.post("/api/auth/logout", { headers: { "X-CSRF-Protection": "1" } })).status()).toBe(204);
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Tải lên", exact: true }).click();
  await page.getByLabel("Tệp tài liệu *").setInputFiles(pdf);
  await page.getByRole("radio", { name: /^Riêng tư/ }).check();
  await page.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByText("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", { exact: true })).toBeVisible();
});

test("M4-02 · SPA reload, immutable assets and CSRF header on real writes", async ({ page, context }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.headers()["x-csrf-protection"] ?? "missing");
  });
  await register(page, "csrf");
  const doc = await upload(page, `csrf-${Date.now()}`, "PUBLIC");
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tài liệu của tôi", exact: true })).toBeVisible();
    const asset = await page.locator('script[src*="/assets/"]').getAttribute("src");
    expect(asset).toBeTruthy();
    expect((await context.request.get(asset!)).headers()["cache-control"]).toContain("immutable");
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(writes.every((value) => value === "1")).toBe(true);
    expect((await context.request.post("/api/auth/logout")).status()).toBe(403);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light dark");
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  } finally { await remove(context.request, doc.id); }
});
