import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { installContractMock } from './contractMock';
import { documentFixture } from '../src/test/fixtures';

test('recommendations: opt-in disclosure, keyboard combobox, related and WCAG AA', async ({ page }) => {
  await installContractMock(page, true);
  let enabled = false, historyItems = 2;
  await page.route('**/api/recommendations/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const ok = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    if (path.endsWith('/home')) return ok({ strategy: enabled ? 'PERSONALIZED' : 'NEWEST', items: [{ document: documentFixture, reason: 'NEW' }] });
    if (path.endsWith('/suggestions')) return ok({ items: [{ documentId: documentFixture.id, title: documentFixture.title }] });
    if (path.endsWith('/history')) { historyItems = 0; return route.fulfill({ status: 204 }); }
    if (req.method() === 'PUT') enabled = req.postDataJSON().personalizationEnabled;
    return ok({ personalizationEnabled: enabled, historyItems });
  });
  await page.route('**/api/documents/*/related*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { items: [{ ...documentFixture, id: '11111111-1111-4111-8111-111111111111', title: 'Tài liệu liên quan AWS' }] } }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Bật', exact: true }).click();
  await expect(page.getByText(/Khi bật, hệ thống lưu tài liệu bạn xem và tải trong 90 ngày/)).toBeVisible();
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: 'Tuỳ chọn gợi ý' }).click();
  await page.getByRole('button', { name: 'Xoá lịch sử' }).click();
  await expect.poll(() => historyItems).toBe(0);
  const search = page.getByRole('combobox', { name: 'Tìm theo tiêu đề hoặc mô tả' });
  await search.fill('Giải'); await expect(page.getByRole('listbox')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await search.press('ArrowDown'); await search.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/documents/${documentFixture.id}$`));
  await expect(page.getByRole('heading', { name: 'Tài liệu liên quan', exact: true })).toBeVisible();
});
