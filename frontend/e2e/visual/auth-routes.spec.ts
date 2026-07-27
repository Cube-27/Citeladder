import { expect, test, type Page } from '@playwright/test';

import { hideDevChrome, seedTheme, stubAuthedShell } from '../helpers/app-fixture';

/**
 * Auth + onboarding baselines — the marketing/app seam
 * (components/auth/brand-panel.tsx). Light-only: the auth split screen is
 * `.mkt-root` (light-pinned like the rest of the Proof surface), and
 * onboarding is shot in the default light theme. Desktop-only.
 *
 * /onboarding sits behind SessionGuard (app/(onboarding)/onboarding/layout
 * .tsx), so it gets the same authed-shell stubs as the app routes; /login and
 * /register are static forms that only call the API on submit.
 */
async function settleAndShoot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await hideDevChrome(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test.describe.parallel('auth routes', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'auth screens shoot at desktop only');

  for (const { path, slug } of [
    { path: '/login', slug: 'login' },
    { path: '/register', slug: 'register' },
  ] as const) {
    test(slug, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await settleAndShoot(page, `${slug}.png`);
    });
  }

  test('onboarding', async ({ page }) => {
    await stubAuthedShell(page);
    await seedTheme(page, 'light');
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await settleAndShoot(page, 'onboarding.png');
  });
});
