import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { documentFixture } from "../src/test/fixtures";
import { palettes, THEME_STORAGE_KEY } from "../src/theme/palettes";
import { installContractMock } from "./contractMock";

test("theme · đổi độc lập, lưu sau reload, theo hệ thống và trả focus", async ({ page }) => {
  await installContractMock(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const root = page.locator("html");
  const trigger = page.getByRole("button", { name: "Tuỳ chỉnh giao diện" });
  const dialog = page.getByRole("dialog", { name: "Giao diện của bạn" });
  await trigger.click();
  await expect(dialog.getByRole("group", { name: "Chọn bảng màu" }).getByRole("button")).toHaveCount(19);
  await dialog.getByRole("button", { name: "Neon Violet", exact: true }).click();
  await dialog.getByRole("button", { name: "Tối", exact: true }).click();
  await dialog.getByRole("button", { name: "Xong", exact: true }).click();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "violet");
  await expect(root).toHaveAttribute("data-color-scheme", "dark");
  await expect(trigger).toContainText("Neon Violet");
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "violet");
  await trigger.click();
  await expect(dialog.getByRole("button", { name: "Neon Violet", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Tối", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveAttribute("data-color-scheme", "dark");
  await dialog.getByRole("button", { name: "Theo hệ thống", exact: true }).click();
  await expect(root).toHaveAttribute("data-color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveAttribute("data-color-scheme", "dark");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("theme · cấu hình hỏng hoặc chặn storage vẫn đổi được giao diện", async ({ page }) => {
  await installContractMock(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "{broken"), THEME_STORAGE_KEY);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cold");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage disabled", "SecurityError"); },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Tuỳ chỉnh giao diện" }).click();
  await page.getByRole("button", { name: "Neon Gold", exact: true }).click();
  await page.getByRole("button", { name: "Tối", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gold");
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
});

test("theme · 19 bảng màu sáng/tối, tương phản và bộ chọn mobile", async ({ page }) => {
  test.setTimeout(180_000);
  await installContractMock(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Tuỳ chỉnh giao diện" }).click();
  for (const palette of palettes) {
    await page.getByRole("button", { name: palette.name, exact: true }).click();
    for (const mode of ["Sáng", "Tối"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      const results = await new AxeBuilder({ page })
        .include("dialog[open]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations, `${palette.name} / ${mode}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("theme · cả tám route ở chế độ tối (mock API)", async ({ page }) => {
  test.setTimeout(90_000);
  const state = await installContractMock(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Tuỳ chỉnh giao diện" }).click();
  await page.getByRole("button", { name: "Neon Violet", exact: true }).click();
  await page.getByRole("button", { name: "Tối", exact: true }).click();
  await page.getByRole("button", { name: "Xong", exact: true }).click();
  for (const route of ["/", "/login", "/register", "/khong-ton-tai", `/documents/${documentFixture.id}`, "/me/documents", "/upload", `/documents/${documentFixture.id}/edit`]) {
    if (route === "/me/documents") state.signedIn = true;
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations, route).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
