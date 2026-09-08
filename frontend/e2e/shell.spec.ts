import { expect, test } from '@playwright/test';
import { instant } from '@next/playwright';

import { stubAuthedShell } from './helpers/app-fixture';

/** Authenticated shell navigation and persistent launcher workflows. */
test('authenticated shell exposes authorized navigation and search', async ({ page }) => {
  // stubAuthedShell supplies the canonical user/project AND the 404 catch-all
  // that keeps unstubbed downstream queries (audits, entitlements) from 401-ing
  // the live backend and bouncing the session to /login.
  await stubAuthedShell(page);

  await page.goto('/visibility');

  // Sidebar groups + a nav item. Scoped to the primary nav landmark and
  // exact-matched so page copy can't satisfy or trip the assertion.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('Analyze', { exact: true })).toBeVisible();
  await expect(nav.getByText('Act', { exact: true })).toBeVisible();
  await expect(nav.getByText('Track', { exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Website', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Content', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Search Demand', exact: true })).toBeVisible();

  // Project switcher shows the active brand.
  await expect(page.getByText('Acme').first()).toBeVisible();

  await expect(page.getByRole('heading', { level: 1, name: 'AI Visibility' })).toBeVisible();
  await expect(page.getByRole('button', { name: /search or jump to/i })).toBeVisible();
});

test('primary navigation commits the destination shell instantly', async ({ page }) => {
  await stubAuthedShell(page);
  await page.goto('/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

  await instant(page, async () => {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Performance', exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === '/performance');
    await expect(page.getByRole('heading', { level: 1, name: 'Performance' })).toBeVisible();
  });

  await expect(page.getByRole('heading', { level: 1, name: 'Performance' })).toBeVisible();
});

test('compact navigation hands focus to persistent tools and returns it on Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAuthedShell(page);
  await page.goto('/projects');
  const menu = page.getByRole('button', { name: 'Open navigation' });

  for (const [trigger, title] of [
    ['Search or jump to', 'Command palette'],
    ['Open Growth Agent', 'Growth Agent'],
  ]) {
    await menu.click();
    const navigation = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await navigation.getByRole('button', { name: trigger, exact: true }).click();
    await expect(navigation).not.toBeVisible();
    const tool = page.getByRole('dialog', { name: title, exact: true });
    await expect(tool).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tool).not.toBeVisible();
    await expect(menu).toBeFocused();
  }
});
