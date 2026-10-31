import { expect, test } from '@playwright/test';

import { NAV_DROPS } from '@/lib/marketing-content/nav';

/**
 * Marketing navigation in a real engine.
 *
 * The navigation is server-rendered Astro markup with a plain script
 * (components/marketing/chrome/marketing-nav.ts), so its interaction contract
 * — hover intent, focus return, the inert page behind the mobile sheet — is
 * pinned here against the built site rather than in jsdom.
 */
const DROP_KEYS = NAV_DROPS.map((drop) => drop.key);

test.describe('marketing navigation (real-engine CSS contract)', () => {
  test('desktop disclosures open on the first tap on a touch device', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      hasTouch: true,
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto('/platform');
    const toggle = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Platform', exact: true });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#desktop-nav-panel-platform')).toBeVisible();
    await toggle.tap();
    await expect(page.locator('#desktop-nav-panel-platform')).toBeHidden();
    await context.close();
  });

  test('Escape restores the desktop disclosure focus without reopening it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/platform/site-health');
    const toggle = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Platform', exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(page.locator('#desktop-nav-panel-platform')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 900 });
    const mobileToggle = page.getByRole('button', { name: 'Open menu' });
    await mobileToggle.click();
    await page.keyboard.press('Escape');
    await expect(mobileToggle).toBeFocused();
    await expect(page.locator('#mobile-menu')).toBeHidden();
  });

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

  test('a resting pointer opens a menu that a click pins and a second click closes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/faq');
    const trigger = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Platform', exact: true });
    await trigger.hover();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('#desktop-nav-panel-platform').getByRole('link', { name: /Platform overview/ }),
    ).toHaveAttribute('href', '/platform');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#desktop-nav-panel-platform')).toBeHidden();
  });

  test('Resources opens as named sections of links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/faq');
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Resources', exact: true })
      .click();
    const panel = page.locator('#desktop-nav-panel-resources');
    await expect(panel.getByRole('group')).toHaveText([/^Learn/, /^Product/, /^Tools/]);
    await expect(
      panel.getByRole('group', { name: 'Product' }).getByRole('link', { name: /Open source/ }),
    ).toHaveAttribute('href', '/open-source');
    await expect(
      panel.getByRole('group', { name: 'Tools' }).getByRole('link', { name: /LLM rank tracker/ }),
    ).toHaveAttribute('href', '/llm-rank-tracker');
  });

  test('Escape closes a hover-opened menu without taking focus from a field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/faq');
    await page.evaluate(() => {
      const field = document.createElement('input');
      field.setAttribute('aria-label', 'Message');
      document.querySelector('main')?.prepend(field);
    });
    const trigger = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Platform', exact: true });
    await trigger.hover();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const field = page.getByRole('textbox', { name: 'Message' });
    await field.focus();
    await page.keyboard.press('Escape');
    await expect(field).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('the open mobile menu takes the page behind it out of reach', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/faq');
    const pageInert = () =>
      page.evaluate(() => document.querySelector('main')?.closest('[inert]') !== null);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect.poll(pageInert).toBe(true);
    const menu = page.locator('#mobile-menu');
    await menu.getByRole('button', { name: 'Platform', exact: true }).click();
    await expect(menu.getByRole('link', { name: /Platform overview/ })).toBeVisible();
    const logIn = menu.getByRole('link', { name: 'Log in' });
    // The product origin playwright.config.ts gives the marketing build.
    await expect(logIn).toHaveAttribute('href', 'http://127.0.0.1:3100/login');
    await page.keyboard.press('Escape');
    await expect.poll(pageInert).toBe(false);
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
