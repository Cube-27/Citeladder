import { expect, test } from '@playwright/test';

/** Item counts come from lib/marketing-content/nav.ts. */
const DROPS = [
  { key: 'platform', count: 9 },
  { key: 'solutions', count: 4 },
  { key: 'resources', count: 3 },
] as const;

test.describe('marketing navigation (real-engine CSS contract)', () => {
  test('desktop dropdowns open on hover and focus, then close with Escape', async ({ page }) => {
    await page.goto('/');

    for (const { key, count } of DROPS) {
      const trigger = page.locator(`button[aria-controls="desktop-nav-panel-${key}"]`);
      const panel = page.locator(`#desktop-nav-panel-${key}`);

      await trigger.hover();
      await expect(panel).toBeVisible();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.getByRole('menuitem')).toHaveCount(count);

      await trigger.focus();
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

  test('marketing keeps its fixed light Proof identity, whatever the app theme', async ({
    page,
  }) => {
    await page.goto('/');
    // Proof is light-only, so there is deliberately no toggle to offer.
    await expect(page.getByRole('button', { name: 'Toggle color theme' })).toHaveCount(0);
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');

    // Even with dark explicitly stored by the app, the public surface stays paper.
    await page.evaluate(() => window.localStorage.setItem('searchify-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  });

  test('nav gains its scrolled state after scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-scrolled="true"]')).toHaveCount(0);
    await page.mouse.wheel(0, 600);
    await expect(page.locator('[data-scrolled="true"]')).toHaveCount(1);
  });

  test('the page body never scrolls sideways at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/', '/pricing', '/solutions', '/enterprise', '/faq', '/compare']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
