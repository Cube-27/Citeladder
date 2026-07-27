import { expect, test, type Page } from '@playwright/test';

import { hideDevChrome } from '../helpers/app-fixture';

/**
 * Marketing baselines. The Proof surface is pinned light-only by
 * marketing-theme.css (`html:has(.mkt-root)` forces `color-scheme: light`),
 * so one theme each — the pinning is asserted once below instead of shooting
 * an identical "dark" set.
 *
 * Desktop covers all 10 routes; mobile covers the 5 highest-traffic ones.
 * Dynamic routes use real content slugs so they don't shoot the 404 page.
 */
const ROUTES = [
  { path: '/', slug: 'home' },
  { path: '/blog', slug: 'blog' },
  { path: '/blog/how-we-measure-ai-visibility-deterministically', slug: 'blog-post' },
  { path: '/compare', slug: 'compare' },
  { path: '/compare/profound', slug: 'compare-competitor' },
  { path: '/demo', slug: 'demo' },
  { path: '/enterprise', slug: 'enterprise' },
  { path: '/faq', slug: 'faq' },
  { path: '/pricing', slug: 'pricing' },
  { path: '/solutions', slug: 'solutions' },
] as const;

const MOBILE_SLUGS = new Set(['home', 'pricing', 'compare', 'enterprise', 'demo']);

async function settleAndShoot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await hideDevChrome(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

test.describe.parallel('marketing routes — desktop', () => {
  test.skip(({ viewport }) => viewport?.width !== 1440, 'desktop set shoots at 1440px only');

  for (const { path, slug } of ROUTES) {
    test(slug, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await settleAndShoot(page, `${slug}.png`);
    });
  }

  test('marketing surface ignores dark color-scheme emulation', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).colorScheme))
      .toBe('light');
  });

  // Guards the visual.config contextOptions wiring: if reducedMotion ever
  // stops reaching the context, reveal scenes shoot mid-animation and the
  // baselines go flaky — fail loudly here instead.
  test('reduced motion reaches the page', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
      .toBe(true);
  });
});

test.describe.parallel('marketing routes — mobile', () => {
  test.skip(({ viewport }) => viewport?.width !== 390, 'mobile set shoots at 390px only');

  for (const { path, slug } of ROUTES.filter(({ slug }) => MOBILE_SLUGS.has(slug))) {
    test(slug, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await settleAndShoot(page, `${slug}.png`);
    });
  }
});
