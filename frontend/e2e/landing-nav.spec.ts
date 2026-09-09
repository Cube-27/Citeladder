import { expect, test } from '@playwright/test';

/** Item counts come from lib/marketing-content/nav.ts. */
const DROPS = [
  { key: 'platform', count: 4 },
  { key: 'solutions', count: 5 },
  { key: 'resources', count: 3 },
] as const;

test.describe('marketing navigation (real-engine CSS contract)', () => {
  test('desktop dropdowns open on hover and focus, then close with Escape', async ({ page }) => {
    await page.goto('/');

    for (const { key, count } of DROPS) {
      // The top-level link IS the trigger — the separate chevron button is
      // gone, so `aria-expanded`/`aria-controls` live on the link itself.
      const directLink = page.getByRole('link', { name: new RegExp(`^${key}$`, 'i') }).first();
      const panel = page.locator(`#desktop-nav-panel-${key}`);

      await directLink.hover();
      await expect(panel).toBeVisible();
      await expect(directLink).toHaveAttribute('aria-expanded', 'true');
      await expect(directLink).toHaveAttribute('aria-controls', `desktop-nav-panel-${key}`);
      await expect(panel.getByRole('link')).toHaveCount(count);

      await directLink.focus();
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    }
  });

  test('mobile menu exposes all three accordions at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(menu).toBeVisible();

    for (const { key, count } of DROPS) {
      const trigger = page.locator(`button[aria-controls="acc-${key}"]`);
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const links = page.locator(`#acc-${key}`).getByRole('link');
      await expect(links).toHaveCount(count);
      await expect(links.first()).toBeVisible();
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
