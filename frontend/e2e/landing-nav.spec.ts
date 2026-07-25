import { expect, test } from '@playwright/test';

const DROPS = [
  { key: 'product', count: 9 },
  { key: 'resources', count: 3 },
  { key: 'solutions', count: 4 },
] as const;

test.describe('marketing navigation (real-engine CSS contract)', () => {
  test('desktop dropdowns open on hover and focus, then close with Escape', async ({ page }) => {
    await page.goto('/');

    for (const { key, count } of DROPS) {
      // Each trigger controls its own panel, nested inside its .nav-item so the
      // menu items stay reachable when focus moves into them.
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

  test('marketing keeps its fixed dusk identity independent of the app theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Toggle color theme' })).toHaveCount(0);
    await expect(page.locator('.mkt')).toHaveCSS('color-scheme', 'dark');
  });

  test('mobile evidence rows flow inline without overlap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const row = page.locator('.mkt .evidence-row').first();
    const engine = await row.locator('.ev-engine').boundingBox();
    const badge = await row.locator('.badge').boundingBox();
    expect(engine).not.toBeNull();
    expect(badge).not.toBeNull();
    expect(Math.abs((engine as { y: number }).y - (badge as { y: number }).y)).toBeLessThan(4);
    expect(
      (engine as { x: number; width: number }).x + (engine as { width: number }).width,
    ).toBeLessThanOrEqual((badge as { x: number }).x);
  });

  test('nav gains the scrolled class after scrolling', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).not.toHaveClass(/scrolled/);
    await page.mouse.wheel(0, 600);
    await expect(nav).toHaveClass(/scrolled/);
  });
});
