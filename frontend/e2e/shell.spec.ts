import { expect, test } from '@playwright/test';
import { instant } from '@next/playwright';

import { FIXTURE_WORKSPACE_ID, fixtureProjectPath, stubAuthedShell } from './helpers/app-fixture';

/** Authenticated shell navigation and persistent launcher workflows. */
test('authenticated shell exposes authorized navigation and search', async ({ page }) => {
  // stubAuthedShell supplies the canonical user/project AND the 404 catch-all
  // that keeps unstubbed downstream queries (audits, entitlements) from 401-ing
  // the live backend and bouncing the session to /login.
  await stubAuthedShell(page);

  await page.goto(fixtureProjectPath('/visibility'));

  // The station list and its destinations are pinned against NAV_GROUPS in
  // components/layout/sidebar-nav.test.tsx. What that render cannot show is
  // that the authed layout actually mounts the nav landmark around the page.
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Website', exact: true })).toBeVisible();

  // Project switcher shows the active brand.
  await expect(page.getByText('Acme').first()).toBeVisible();

  await expect(page.getByRole('heading', { level: 1, name: 'AI Visibility' })).toBeVisible();
  await expect(page.getByRole('button', { name: /search or jump to/i })).toBeVisible();
});

test('primary navigation commits the destination shell instantly', async ({ page }) => {
  await stubAuthedShell(page);
  await page.goto(fixtureProjectPath('/projects'));
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
  await page.goto(fixtureProjectPath('/projects'));
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

test('project lookup failure retries in place and only confirmed empty projects enter onboarding', async ({
  page,
}) => {
  await stubAuthedShell(page, [], []);
  let failed = true;
  await page.route('**/api/v1/projects', (route) =>
    failed
      ? route.fulfill({ status: 403, json: { detail: 'Project lookup unavailable' } })
      : route.fulfill({ json: [] }),
  );
  await page.goto('/projects');
  // The workspace resolved; it is the PROJECT list that 403'd, and the notice
  // says so rather than sending the reader after an access problem that is
  // not there.
  await expect(page.getByRole('heading', { name: 'Projects could not be loaded' })).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  failed = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  // The redirect carries the workspace the project will be created in — the
  // one the fixture put the reader in — so a refresh of the creation route
  // cannot silently re-target it.
  await expect(page).toHaveURL(`/onboarding?workspace=${FIXTURE_WORKSPACE_ID}`);
  await expect(page.getByRole('heading', { name: "Let's get started" })).toBeVisible();
});
