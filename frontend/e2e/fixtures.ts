import { createHash } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { DocumentDto, Visibility } from "../src/api/types";

export const password = "E2e-password-123";
export const pdf = {
  name: "Đề cương Giải tích.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  ),
};
export const hash = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
export async function register(page: Page, label = "A") {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị *").fill(`Sinh viên ${label}`);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Mật khẩu *", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu *").fill(password);
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(page).toHaveURL("/me/documents");
  return email;
}
export async function upload(
  page: Page,
  title: string,
  visibility: Visibility,
) {
  await page.goto("/upload");
  await expect(
    page.getByRole("radio", { name: /^Công khai/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Riêng tư/ }),
  ).not.toBeChecked();
  await page.getByLabel("Tệp tài liệu *").setInputFiles(pdf);
  await page.getByLabel("Tiêu đề *").fill(title);
  await page
    .getByRole("radio", {
      name: visibility === "PUBLIC" ? /^Công khai/ : /^Riêng tư/,
    })
    .check();
  const response = page.waitForResponse(
    (value) =>
      value.url().endsWith("/api/documents") &&
      value.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Tải lên", exact: true }).click();
  const actual = await response;
  expect(actual.status()).toBe(201);
  const { data } = (await actual.json()) as { data: DocumentDto };
  await expect(page).toHaveURL("/me/documents");
  return data;
}
export async function remove(request: APIRequestContext, id: string) {
  const response = await request.delete(`/api/documents/${id}`, {
    headers: { "X-CSRF-Protection": "1" },
  });
  expect([204, 404]).toContain(response.status());
}
