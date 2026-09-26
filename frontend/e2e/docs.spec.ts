import { expect, test } from '@playwright/test';

test('search recovers, supports keyboard dismissal and navigates to a guide', async ({ page }) => {
  await page.route('**/search-index.json', (route) => route.fulfill({ status: 503 }), { times: 2 });
  await page.goto('/');
  await page.getByRole('button', { name: /Search docs/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Retry search' })).toBeVisible();
  const retry = page.waitForResponse('**/search-index.json');
  await dialog.getByRole('button', { name: 'Retry search' }).click();
  await retry;
  await expect(dialog.getByRole('button', { name: 'Retry search' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Search docs/ })).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(dialog.getByRole('textbox', { name: 'Search terms' })).toBeFocused();
  await page.keyboard.type('outline approval');
  await expect(dialog.getByRole('link').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry search' })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Search terms' }).fill('zzzz-no-such-guide');
  await expect(dialog.getByRole('status')).toContainText('No matching guides');
  await dialog.getByRole('textbox', { name: 'Search terms' }).fill('Outputs and revisions');
  await dialog.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/agent\/outputs\//);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to CiteLadder');
});

test('guides and local anchors resolve, and missing pages return 404', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const routes = await page
    .locator('.docs-sidebar nav a')
    .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const links = await page
      .locator('main a, .docs-toc a')
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter((href) => new URL(href).origin === location.origin),
      );
    for (const link of links) {
      const url = new URL(link);
      expect(routes, `Unregistered docs link ${link}`).toContain(url.pathname);
      if (url.hash) {
        await page.goto(link);
        expect(
          await page.evaluate(
            (id) => document.getElementById(id) !== null,
            decodeURIComponent(url.hash.slice(1)),
          ),
          link,
        ).toBe(true);
      }
    }
  }
  const missing = await page.goto('/this-guide-does-not-exist/');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('mobile navigation and article contents remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.docs-mobile-nav > summary').click();
  await page
    .locator('.docs-mobile-nav')
    .getByRole('link', { name: 'Actions and measurement', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Actions and measurement');
  await page.locator('.docs-mobile-toc > summary').click();
  await page
    .locator('.docs-mobile-toc')
    .getByRole('link', { name: 'Declare implementation' })
    .click();
  await expect(page).toHaveURL(/#declare-implementation$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/agent/actions/');
  await page.screenshot({ path: test.info().outputPath('docs-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: test.info().outputPath('docs-desktop.png') });
});
