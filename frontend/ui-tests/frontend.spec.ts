import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { documentFixture } from "../src/test/fixtures";
import { installContractMock } from "./contractMock";

const pdf = {
  name: "Đề cương.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.7\n%%EOF"),
};
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [360, 768, 1280]) {
  test(`responsive ${width}px · cả tám route và axe WCAG AA (mock API)`, async ({
    page,
  }) => {
    const state = await installContractMock(page);
    await page.setViewportSize({ width, height: 900 });
    const routes = [
      "/",
      "/login",
      "/register",
      "/khong-ton-tai",
      `/documents/${documentFixture.id}`,
    ];
    const titles = [
      "Khám phá tài liệu học tập",
      "Đăng nhập",
      "Tạo tài khoản",
      "Không tìm thấy trang",
      documentFixture.title,
    ];
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await expect(
        page.getByRole("heading", {
          name: titles[index],
          level: 1,
          exact: true,
        }),
      ).toBeVisible();
      if (route === "/")
        await expect(
          page.getByRole("link", { name: documentFixture.title, exact: true }),
        ).toBeVisible();
      await noOverflow(page);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations,
        `${route}: ${JSON.stringify(results.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) })))}`,
      ).toEqual([]);
    }
    state.signedIn = true;
    for (const route of [
      "/me/documents",
      "/upload",
      `/documents/${documentFixture.id}/edit`,
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (route.endsWith("/edit"))
        await expect(page.getByLabel("Tiêu đề *")).toBeVisible();
      if (route === "/me/documents")
        await expect(
          page.getByRole("link", { name: documentFixture.title, exact: true }),
        ).toBeVisible();
      await noOverflow(page);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        results.violations,
        `${route}: ${JSON.stringify(results.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) })))}`,
      ).toEqual([]);
    }
    await page.screenshot({
      path: `test-results/collection-${width}.png`,
      fullPage: true,
    });
  });
}

test("bàn phím · upload tường minh, focus dialog, Escape và trả focus (mock API)", async ({
  page,
}) => {
  await installContractMock(page, true);
  await page.goto("/upload");
  await expect(
    page.getByRole("heading", { name: "Tải lên tài liệu" }),
  ).toBeFocused();
  await expect(
    page.getByRole("radio", { name: /^Công khai/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Riêng tư/ }),
  ).not.toBeChecked();
  const chooser = page.waitForEvent("filechooser");
  // Focus the file input through sequential keyboard navigation, then activate it.
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Tệp tài liệu *")).toBeFocused();
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(pdf);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Tiêu đề *")).toBeFocused();
  await page.keyboard.type("Tài liệu bàn phím");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Mô tả kiểm tra");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /^Công khai/ })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Tải lên", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/me/documents");
  await page.goto(`/documents/${documentFixture.id}`);
  const remove = page.getByRole("button", { name: "Xoá", exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Xoá vĩnh viễn tài liệu?" });
  await expect(
    dialog.getByRole("button", { name: "Huỷ", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Huỷ", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Huỷ", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Xoá vĩnh viễn", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Huỷ", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(remove).toBeFocused();
});

test("mobile menu, navigation focus và nhãn thông báo (mock API)", async ({
  page,
}) => {
  await installContractMock(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(page.getByRole("button", { name: "Đóng menu" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("link", { name: "Đăng ký", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tạo tài khoản" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByLabel("Tên hiển thị *")).toBeFocused();
  await expect(page.getByLabel("Tên hiển thị *")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await noOverflow(page);
});

test("lỗi XHR upload/thay tệp không báo thành công (mock API)", async ({
  page,
}) => {
  const state = await installContractMock(page, true);
  state.failUpload = true;
  state.failReplace = true;
  await page.goto("/upload");
  await page.getByLabel("Tệp tài liệu *").setInputFiles(pdf);
  await page.getByRole("radio", { name: /^Riêng tư/ }).check();
  await page.getByRole("button", { name: "Tải lên", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Kho lưu trữ tệp tạm thời không khả dụng.",
  );
  await expect(
    page.getByText("Tải lên thành công", { exact: true }),
  ).toHaveCount(0);
  await page.goto(`/documents/${documentFixture.id}/edit`);
  await page.getByLabel("Tệp tài liệu *").setInputFiles(pdf);
  await page.getByRole("button", { name: "Thay thế tệp", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Thay thế", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Tệp hiện tại vẫn được giữ nguyên.",
  );
  await expect(page.getByText(/Phiên bản 1/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Công khai/ })).toBeChecked();
  await expect(page.getByText("Đã thay thế tệp", { exact: true })).toHaveCount(
    0,
  );
});

test("redirect đăng nhập và đăng xuất giữ đúng đích (mock API)", async ({
  page,
}) => {
  await installContractMock(page);
  await page.goto("/upload");
  await expect(page).toHaveURL(/login\?redirect=/);
  await page.getByLabel("Email *").fill("a@example.com");
  await page.getByLabel("Mật khẩu *").fill("password123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/upload");
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL("/");
});
