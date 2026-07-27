import { expect, test, type Page } from '@playwright/test';

import { hideDevChrome, seedTheme, stubAuthedShell } from '../helpers/app-fixture';

/**
 * Screenshot baseline for every rendering `(app)` route × both themes.
 *
 * `/providers` and `/prompt-research` are excluded — pure `redirect()` shims
 * with no UI. Dynamic routes use fixture ids; their data endpoints fall
 * through to the 404 catch-all, so detail pages shoot their empty/error
 * state. That IS the deterministic baseline: 4xx never retries, so every
 * query settles in one attempt.
 *
 * Desktop-only: the app shell is a desktop surface; the mobile project exists
 * for the marketing routes.
 */
const ROUTES = [
  { path: '/visibility', slug: 'visibility' },
  { path: '/analytics', slug: 'analytics' },
  { path: '/traffic', slug: 'traffic' },
  { path: '/prompts', slug: 'prompts' },
  { path: '/opportunities', slug: 'opportunities' },
  { path: '/content', slug: 'content' },
  { path: '/issues', slug: 'issues' },
  { path: '/knowledge-base', slug: 'knowledge-base' },
  { path: '/products', slug: 'products' },
  { path: '/products/11111111-1111-4111-8111-111111111111', slug: 'products-detail' },
  { path: '/projects', slug: 'projects' },
  { path: '/runs', slug: 'runs' },
  { path: '/runs/33333333-3333-4333-8333-333333333333', slug: 'runs-detail' },
  {
    path: '/runs/33333333-3333-4333-8333-333333333333/executions/44444444-4444-4444-8444-444444444444',
    slug: 'runs-execution',
  },
  { path: '/settings', slug: 'settings' },
  { path: '/site-health', slug: 'site-health' },
  {
    path: '/site-health/crawls/55555555-5555-4555-8555-555555555555/pages/66666666-6666-4666-8666-666666666666',
    slug: 'site-health-page-detail',
  },
] as const;

/** Settle, then shoot: stubs fulfill instantly, so networkidle means every
 *  query has resolved/errored and no skeleton is left. */
async function settleAndShoot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.skeleton').first()).toBeHidden();
  await hideDevChrome(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test.describe.parallel('app routes', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'app shell shoots at desktop only');

  for (const { path, slug } of ROUTES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${slug} — ${theme}`, async ({ page }) => {
        await stubAuthedShell(page);
        await seedTheme(page, theme);
        await page.goto(path);
        // The shell's h1 is the route-derived title; visible once
        // SessionGuard resolves against the stubbed /auth/me.
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await settleAndShoot(page, `${slug}-${theme}.png`);
      });
    }
  }
});
