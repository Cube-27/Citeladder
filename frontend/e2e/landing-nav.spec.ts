import { expect, test } from '@playwright/test';

import { NAV_DROPS } from '@/lib/marketing-content/nav';

/**
 * Marketing navigation, real-engine claims ONLY.
 *
 * The per-dropdown interaction contract — hover/focus opens, Escape closes,
 * truthful `aria-expanded`/`aria-controls`, one link per configured item — is
 * pinned in jsdom by components/marketing/chrome/nav.test.tsx. The panel is
 * rendered from React state (nav-desktop.tsx), not a CSS `:hover` rule, so
 * re-running that matrix in a browser proves nothing new and costs a page load
 * per dropdown. What a real engine DOES decide is which of the two navs the
 * viewport gets (a `lg:` media query) and whether the page overflows.
 */
const DROP_KEYS = NAV_DROPS.map((drop) => drop.key);

test.describe('marketing navigation (real-engine CSS contract)', () => {
  test('serves the desktop nav above the lg breakpoint and the mobile menu below it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    const openMenu = page.getByRole('button', { name: 'Open menu' });
    await expect(openMenu).toBeVisible();

    // The accordions exist only inside the mobile menu, so opening it is the
    // only way to prove the small-viewport nav is reachable at all.
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeHidden();
    await openMenu.click();
    await expect(menu).toBeVisible();
    for (const key of DROP_KEYS) {
      await expect(page.locator(`button[aria-controls="acc-${key}"]`)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(menu).toBeHidden();
  });

  test('the page body never scrolls sideways at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/', '/pricing', '/compare']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
