import { expect, test } from '@playwright/test';

test('landing renders monitored answer engines without a backend', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');

  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await expect(h1).toHaveCount(1);

  await expect(page.getByRole('region', { name: 'Monitored answer engines' })).toBeVisible();

  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
});
