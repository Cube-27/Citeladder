import { expect, test } from '@playwright/test';

/**
 * Smoke: the public landing page renders at `/` with no backend running,
 * the hero owns the page's single level-1 heading, and the monitored answer
 * engines render.
 *
 * The previous version of this test clicked a theme toggle in the marketing
 * nav. There is no such control — the public surface is a fixed light identity
 * — so it could only ever have failed.
 */
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
