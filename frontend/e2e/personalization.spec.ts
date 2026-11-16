import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createPersonalizationScenario } from '../../backend/test/fixtures/personalization-scenario';

// This browser scenario uses real HTTP, MySQL and S3-compatible storage. No routes are mocked.
test.use({ channel: 'chrome' });
let scenario: Awaited<ReturnType<typeof createPersonalizationScenario>>;
let server: Server;
let origin: string;
test.beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  origin = `http://127.0.0.1:${address.port}`;
  scenario = await createPersonalizationScenario({
    ALLOWED_ORIGINS: origin, SERVE_FRONTEND: 'true',
    FRONTEND_DIST_DIR: fileURLToPath(new URL('../dist', import.meta.url)),
  });
  server.on('request', scenario.ctx.app);
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (scenario) await scenario.close();
});

async function reader(browser: Browser, displayName: string) {
  const context = await browser.newContext({ baseURL: origin });
  const response = await context.request.post('/api/auth/register', {
    headers: { 'X-CSRF-Protection': '1' },
    data: { email: `personalization.${randomUUID()}@example.com`, displayName, password: 'matkhau123' },
  });
  expect(response.status(), await response.text()).toBe(201);
  const id = (await response.json()).data.user.id as string;
  return { context, page: await context.newPage(), id };
}
async function learn(page: Page, sourceId: string) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Bật', exact: true }).click();
  await expect(page.getByText(/Khi bật, hệ thống lưu tài liệu bạn xem và tải trong 90 ngày/)).toBeVisible();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch').click();
  await expect(page.getByRole('button', { name: 'Tuỳ chọn gợi ý', exact: true })).toBeVisible();
  await page.goto(`${origin}/documents/${sourceId}`);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải xuống', exact: true }).click();
  expect(await (await downloaded).failure()).toBeNull();
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Gợi ý cho bạn', exact: true })).toBeVisible();
}

test('two real readers get different topics; clear/disable persist and remain isolated', async ({ browser }) => {
  test.setTimeout(90_000);
  const cloud = await reader(browser, 'Cloud browser reader');
  const ai = await reader(browser, 'AI browser reader');
  try {
    await learn(cloud.page, scenario.ids[0]!);
    await learn(ai.page, scenario.ids[10]!);
    const suggestions = (page: Page) => page.getByRole('region', { name: 'Gợi ý tài liệu', exact: true });
    const titles = (page: Page) => suggestions(page).locator('a[href^="/documents/"]');
    await expect(titles(cloud.page).first()).toContainText('AWS');
    await expect(titles(ai.page).first()).toContainText('AI');
    await expect(suggestions(cloud.page).locator(`a[href="/documents/${scenario.ids[0]}"]`)).toHaveCount(0);
    await expect(suggestions(ai.page).locator(`a[href="/documents/${scenario.ids[10]}"]`)).toHaveCount(0);
    for (const user of [cloud, ai]) {
      await expect.poll(() => scenario.ctx.prisma.documentInteraction.count({ where: { userId: user.id } })).toBe(2);
    }

    await cloud.page.getByRole('button', { name: 'Tuỳ chọn gợi ý', exact: true }).click();
    const cleared = cloud.page.waitForResponse((response) => response.url().endsWith('/api/recommendations/history') && response.request().method() === 'DELETE');
    await cloud.page.getByRole('button', { name: 'Xoá lịch sử', exact: true }).click();
    expect((await cleared).status()).toBe(204);
    await expect(cloud.page.getByRole('heading', { name: 'Tài liệu nổi bật', exact: true })).toBeVisible();
    expect(await scenario.ctx.prisma.documentInteraction.count({ where: { userId: cloud.id } })).toBe(0);
    expect(await scenario.ctx.prisma.documentInteraction.count({ where: { userId: ai.id } })).toBe(2);
    await expect(cloud.page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await ai.page.getByRole('button', { name: 'Tuỳ chọn gợi ý', exact: true }).click();
    await ai.page.getByRole('switch').click();
    await expect(ai.page.getByRole('button', { name: 'Bật', exact: true })).toBeVisible();
    expect(await scenario.ctx.prisma.documentInteraction.count({ where: { userId: ai.id } })).toBe(0);
    await ai.page.reload();
    await expect(ai.page.getByRole('button', { name: 'Bật', exact: true })).toBeVisible();
    expect((await scenario.ctx.prisma.user.findUniqueOrThrow({ where: { id: ai.id } })).personalizationEnabled).toBe(false);
    await cloud.page.reload();
    await expect(cloud.page.getByRole('button', { name: 'Tuỳ chọn gợi ý', exact: true })).toBeVisible();
  } finally { await Promise.all([cloud.context.close(), ai.context.close()]); }
});
