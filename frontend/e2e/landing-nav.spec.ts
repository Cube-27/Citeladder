import { expect, test, type Page } from '@playwright/test';

import { NAV_DROPS } from '@/lib/marketing-content/nav';

/**
 * Marketing navigation in a real engine.
 *
 * The desktop menus are a Radix navigation menu island with one shared
 * popup (components/marketing/chrome/desktop-nav.tsx, D22); the mobile sheet
 * is server-rendered markup with a plain script (site-nav.ts). Their
 * interaction contract (hover intent, the popup staying open between menus,
 * focus return, the inert page behind the sheet) is pinned here against the
 * built site rather than in jsdom.
 */
const DROP_KEYS = NAV_DROPS.map((drop) => drop.key);

/**
 * Open a page once its islands are interactive. The desktop menus hydrate
 * with `client:load`, after the load event `goto` waits for; a key pressed
 * before then reaches server-rendered markup with no handler. Astro removes
 * an island's `ssr` attribute when it hydrates.
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
}

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const trigger = (page: Page, name: string) =>
  mainNav(page).getByRole('button', { name, exact: true });
/** A row of whichever desktop menu is open; menus render only while open. */
const menuLink = (page: Page, name: RegExp) => mainNav(page).getByRole('link', { name });

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
    await open(page, '/platform');
    const toggle = trigger(page, 'Platform');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menuLink(page, /Platform overview/)).toBeVisible();
    await toggle.tap();
    await expect(menuLink(page, /Platform overview/)).toBeHidden();
    await context.close();
  });

  test('Escape restores the desktop disclosure focus without reopening it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/platform/site-health');
    const toggle = trigger(page, 'Platform');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(menuLink(page, /AI Visibility/)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menuLink(page, /Platform overview/)).toBeHidden();
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
    await open(page, '/');
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
    await open(page, '/faq');
    const platform = trigger(page, 'Platform');
    await platform.hover();
    await expect(platform).toHaveAttribute('aria-expanded', 'true');
    await platform.click();
    await expect(platform).toHaveAttribute('aria-expanded', 'true');
    await expect(menuLink(page, /Platform overview/)).toHaveAttribute('href', '/platform');
    await platform.click();
    await expect(platform).toHaveAttribute('aria-expanded', 'false');
    await expect(menuLink(page, /Platform overview/)).toBeHidden();
  });

  test('one popup stays open from trigger to trigger and down into the menu (D22)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/faq');
    const platform = trigger(page, 'Platform');
    const solutions = trigger(page, 'Solutions');

    await platform.hover();
    await expect(menuLink(page, /Platform overview/)).toBeVisible();
    // Sliding to the neighbour swaps the menu inside the same open popup.
    await solutions.hover();
    await expect(solutions).toHaveAttribute('aria-expanded', 'true');
    await expect(platform).toHaveAttribute('aria-expanded', 'false');
    await expect(menuLink(page, /Agencies/)).toBeVisible();
    await expect(menuLink(page, /Platform overview/)).toBeHidden();

    // Travelling down from the trigger through the gap keeps it open.
    const box = await solutions.boundingBox();
    const row = await menuLink(page, /Agencies/).boundingBox();
    if (!box || !row) throw new Error('the trigger and the open menu are laid out');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2, { steps: 12 });
    await expect(solutions).toHaveAttribute('aria-expanded', 'true');

    // Leaving the navbar closes it.
    await page.mouse.move(row.x + row.width / 2, 800, { steps: 4 });
    await expect(solutions).toHaveAttribute('aria-expanded', 'false');
    await expect(menuLink(page, /Agencies/)).toBeHidden();
  });

  test('the arrow keys move between the top-level items', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/faq');
    await trigger(page, 'Platform').focus();
    await page.keyboard.press('ArrowRight');
    await expect(trigger(page, 'Solutions')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(trigger(page, 'Solutions')).toHaveAttribute('aria-expanded', 'true');
  });

  test('Resources opens as named sections of links', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/faq');
    await trigger(page, 'Resources').click();
    const panel = mainNav(page);
    for (const name of ['Learn', 'Product', 'Tools']) {
      await expect(panel.getByRole('list', { name })).toBeVisible();
    }
    await expect(
      panel.getByRole('list', { name: 'Product' }).getByRole('link', { name: /Open source/ }),
    ).toHaveAttribute('href', '/open-source');
    await expect(
      panel.getByRole('list', { name: 'Tools' }).getByRole('link', { name: /LLM rank tracker/ }),
    ).toHaveAttribute('href', '/llm-rank-tracker');
  });

  test('Escape closes a hover-opened menu without taking focus from a field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/faq');
    await page.evaluate(() => {
      const field = document.createElement('input');
      field.setAttribute('aria-label', 'Message');
      document.querySelector('main')?.prepend(field);
    });
    const platform = trigger(page, 'Platform');
    await platform.hover();
    await expect(platform).toHaveAttribute('aria-expanded', 'true');
    const field = page.getByRole('textbox', { name: 'Message' });
    await field.focus();
    await page.keyboard.press('Escape');
    await expect(field).toBeFocused();
    await expect(platform).toHaveAttribute('aria-expanded', 'false');
  });

  test('the open mobile menu takes the page behind it out of reach', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page, '/faq');
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
      await open(page, path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
