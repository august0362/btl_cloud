import { expect, type Page } from "@playwright/test";

export function developerCredentials() {
  const password = process.env.BTL_TEST_DEVELOPER_PASSWORD;
  if (!password) throw new Error("Đặt BTL_TEST_DEVELOPER_PASSWORD bằng mật khẩu developer được cấp trước khi chạy suite local.");
  return { username: process.env.BTL_TEST_DEVELOPER_USERNAME ?? "developer", password };
}

export async function loginDeveloper(page: Page) {
  const session = await page.request.get("/__local/backend/session");
  if (session.ok() && (await session.json()).user) return;
  const response = await page.request.post("/__local/backend/login", {
    headers: { Origin: "http://localhost:5173", "X-Local-Control": "1" }, data: developerCredentials(),
  });
  expect(response.status()).toBe(200);
}
