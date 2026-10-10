import { expect, test, type Page } from '@playwright/test';

// Search hydrates when the browser is idle; a click before then is not a search.
async function openSearch(page: Page) {
  await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
  await page.getByRole('button', { name: /Search docs/ }).click();
}

test('search recovers, supports keyboard dismissal and navigates to a guide', async ({ page }) => {
  await page.route('**/search-index.json', (route) => route.fulfill({ status: 503 }), { times: 2 });
  await page.goto('/');
  await openSearch(page);
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
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
      if (url.pathname.startsWith('/templates/')) {
        const asset = await page.request.get(link);
        expect(asset.status(), link).toBe(200);
        expect((await asset.body()).byteLength, link).toBeGreaterThan(0);
        continue;
      }
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
  const guide = page.locator('.docs-mobile-nav a:not([aria-current])').first();
  const title = await guide.innerText();
  const guideUrl = await guide.evaluate((anchor) => (anchor as HTMLAnchorElement).href);
  await guide.click();
  await expect(page).toHaveURL(guideUrl);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await page.locator('.docs-mobile-toc > summary').click();
  const section = page.locator('.docs-mobile-toc a').last();
  const sectionUrl = await section.evaluate((anchor) => (anchor as HTMLAnchorElement).href);
  await section.click();
  await expect(page).toHaveURL(sectionUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('built docs enforce a script policy without breaking hydration', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/violates.*(security policy|directive)/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(1);
  await openSearch(page);
  // The search UI builds its input lazily after load; slow CI runners need longer.
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Search terms' })).toBeFocused(
    { timeout: 15_000 },
  );
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "executed"';
    document.body.append(script);
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-injected', 'executed');
});

test('contents omit step numbering without changing article anchors and follow the active heading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/quickstart/');
  const contents = page.getByRole('complementary', { name: 'On this page' });
  // The quickstart's sections are numbered steps; the second is below the fold.
  const link = contents.getByRole('link').nth(1);
  const hash = (await link.getAttribute('href')) ?? '';
  const label = await link.innerText();
  const heading = page.locator(`[id="${hash.slice(1)}"]`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${hash}$`));
  await expect(heading).toBeVisible();
  expect(await heading.innerText()).toBe(`2. ${label}`);
  await expect(link).toHaveAttribute('aria-current', 'location');
  const headingTop = await heading.evaluate((node) => node.getBoundingClientRect().top);
  const headerBottom = await page
    .locator('.docs-header')
    .evaluate((node) => node.getBoundingClientRect().bottom);
  expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
});
