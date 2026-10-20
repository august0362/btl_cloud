import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { hash, password, pdf, register, remove, upload } from "./fixtures";

test("E2E-01 · FR-01/04/05/06 · đăng ký → đăng nhập → upload → kho cá nhân và reload phiên", async ({
  page,
  context,
}) => {
  const email = await register(page);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.goto("/login");
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Mật khẩu *").fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/me/documents");
  const cookies = await context.cookies();
  expect(
    cookies.some(
      (cookie) =>
        cookie.name === "sid" && cookie.httpOnly && cookie.sameSite === "Lax",
    ),
  ).toBe(true);
  expect(await page.evaluate(() => globalThis.document.cookie)).not.toContain(
    "sid=",
  );
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const title = `E2E collection ${Date.now()}`;
  const document = await upload(page, title, "PRIVATE");
  try {
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Tài liệu của tôi" }),
    ).toBeVisible();
  } finally {
    await remove(context.request, document.id);
  }
});

test("E2E-02 · FR-02/03 · Public → Guest tìm kiếm → đăng nhập để tải → checksum", async ({
  page,
  context,
  browser,
}) => {
  const email = await register(page);
  const title = `E2E public ${Date.now()}`;
  const document = await upload(page, title, "PUBLIC");
  const guest = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`/?q=${encodeURIComponent(title)}`);
    await expect(
      guestPage.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      (
        await guest.request.get(`/api/documents/${document.id}/download`)
      ).status(),
    ).toBe(401);
    await guestPage
      .getByRole("link", { name: "Đăng nhập để tải xuống" })
      .click();
    await guestPage.getByLabel("Email *").fill(email);
    await guestPage.getByLabel("Mật khẩu *").fill(password);
    await guestPage
      .getByRole("button", { name: "Đăng nhập", exact: true })
      .click();
    await expect(guestPage).toHaveURL(
      new RegExp(
        `q=${encodeURIComponent(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
    const downloading = guestPage.waitForEvent("download");
    await guestPage
      .getByRole("button", { name: "Tải xuống", exact: true })
      .click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe(pdf.name);
    expect(hash(await readFile((await file.path())!))).toBe(hash(pdf.buffer));
  } finally {
    await guest.close();
    await remove(context.request, document.id);
  }
});

test("E2E-03 · FR-02/03/06 · Private của A không lộ cho Guest hoặc B", async ({
  page,
  context,
  browser,
}) => {
  await register(page, "A");
  const title = `E2E secret ${Date.now()}`;
  const document = await upload(page, title, "PRIVATE");
  const other = await browser.newContext({ baseURL: "http://localhost:3000" });
  try {
    const otherPage = await other.newPage();
    expect(
      (await other.request.get(`/api/documents/${document.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(`/api/documents/${document.id}/download`)
      ).status(),
    ).toBe(401);
    await register(otherPage, "B");
    await otherPage.goto(`/?q=${encodeURIComponent(title)}`);
    await expect(
      otherPage.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
    await otherPage.goto(`/documents/${document.id}`);
    await expect(
      otherPage.getByRole("heading", { name: "Không tìm thấy tài liệu" }),
    ).toBeVisible();
    expect(
      (
        await other.request.get(`/api/documents/${document.id}/download`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.patch(`/api/documents/${document.id}`, {
          headers: { "X-CSRF-Protection": "1" },
          data: { title: "Không được sửa" },
        })
      ).status(),
    ).toBe(404);
    const mine = await other.request.get("/api/documents/mine");
    expect(
      (await mine.json()).data.items.some(
        (item: { id: string }) => item.id === document.id,
      ),
    ).toBe(false);
  } finally {
    await other.close();
    await remove(context.request, document.id);
  }
});

test("E2E-04 · FR-07/08 · sửa metadata → đổi visibility → thay tệp giữ visibility và checksum", async ({
  page,
  context,
}) => {
  await register(page);
  const title = `E2E edit ${Date.now()}`;
  const document = await upload(page, title, "PRIVATE");
  try {
    await page.goto(`/documents/${document.id}/edit`);
    await page.getByLabel("Tiêu đề *").fill(`${title} mới`);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(
      page.getByText("Đã lưu thay đổi", { exact: true }),
    ).toBeVisible();
    await page.getByRole("radio", { name: /^Công khai/ }).check();
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await page
      .getByRole("dialog", { name: "Chuyển sang Công khai?" })
      .getByRole("button", { name: "Chuyển sang Công khai", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lưu thay đổi" }),
    ).toBeDisabled();
    const replacement = {
      ...pdf,
      name: "Bản cập nhật.pdf",
      buffer: Buffer.concat([pdf.buffer, Buffer.from("\n% updated\n")]),
    };
    await page.getByLabel("Tệp tài liệu *").setInputFiles(replacement);
    await page
      .getByRole("button", { name: "Thay thế tệp", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Thay thế tệp?" })
      .getByRole("button", { name: "Thay thế", exact: true })
      .click();
    await expect(page.getByText(/Phiên bản 2/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Công khai/ })).toBeChecked();
    const metadata = (
      await (await context.request.get(`/api/documents/${document.id}`)).json()
    ).data;
    expect(metadata).toMatchObject({
      title: `${title} mới`,
      visibility: "PUBLIC",
      fileVersion: 2,
    });
    const downloaded = await context.request.get(
      `/api/documents/${document.id}/download`,
    );
    expect(hash(await downloaded.body())).toBe(hash(replacement.buffer));
  } finally {
    await remove(context.request, document.id);
  }
});

test("E2E-05 · FR-09 · huỷ xoá không đổi dữ liệu → xác nhận xoá → 404", async ({
  page,
  context,
}) => {
  await register(page);
  const document = await upload(page, `E2E delete ${Date.now()}`, "PUBLIC");
  await page.goto(`/documents/${document.id}`);
  await page.getByRole("button", { name: "Xoá", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Huỷ", exact: true })
    .click();
  expect(
    (await context.request.get(`/api/documents/${document.id}`)).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Xoá", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xoá vĩnh viễn", exact: true })
    .click();
  await expect(page).toHaveURL("/me/documents");
  expect(
    (await context.request.get(`/api/documents/${document.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await context.request.get(`/api/documents/${document.id}/download`)
    ).status(),
  ).toBe(404);
});

test("E2E-06 · FR-04/05/08 · API từ chối nội dung giả, form không báo thành công, tệp cũ còn nguyên", async ({
  page,
  context,
}) => {
  await register(page);
  const document = await upload(page, `E2E invalid ${Date.now()}`, "PRIVATE");
  const fake = {
    name: "gia-mao.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a real PDF"),
  };
  try {
    await page.goto("/upload");
    await page.getByLabel("Tệp tài liệu *").setInputFiles(fake);
    await page.getByRole("radio", { name: /^Riêng tư/ }).check();
    await page.getByRole("button", { name: "Tải lên", exact: true }).click();
    await expect(
      page.getByText("Chỉ hỗ trợ tệp PDF, DOCX, PPTX.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Tải lên thành công", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`/documents/${document.id}/edit`);
    await page.getByLabel("Tệp tài liệu *").setInputFiles(fake);
    await page
      .getByRole("button", { name: "Thay thế tệp", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Thay thế", exact: true })
      .click();
    await expect(
      page.getByText("Chỉ hỗ trợ tệp PDF, DOCX, PPTX.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Phiên bản 1/)).toBeVisible();
    const old = await context.request.get(
      `/api/documents/${document.id}/download`,
    );
    expect(hash(await old.body())).toBe(hash(pdf.buffer));
  } finally {
    await remove(context.request, document.id);
  }
});
