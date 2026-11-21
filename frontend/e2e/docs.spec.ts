import { expect, test, type Page } from '@playwright/test';

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
  await expect(dialog.getByRole('combobox', { name: 'Search terms' })).toBeFocused();
  await page.keyboard.type('revision history');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry search' })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Search terms' }).fill('zzzz-no-such-guide');
  await expect(dialog.getByRole('status')).toContainText('No matching guides');
  await dialog.getByRole('combobox', { name: 'Search terms' }).fill('Outputs and revisions');
  await dialog.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/agent\/outputs\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('guides and local anchors resolve, and missing pages return 404', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  const railRoutes = () =>
    page
      .locator('nav.cl-docs-side a')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
  const guideRoutes = await railRoutes();
  await page.goto('/api/');
  const routes = [...new Set([...guideRoutes, ...(await railRoutes())])];
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  const registered = new Set([
    ...routes,
    ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => new URL(match[1] ?? '').pathname,
    ),
  ]);
  const ids = new Map<string, Set<string>>();
  const links = new Set<string>();
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    ids.set(
      route,
      new Set(await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id))),
    );
    const hrefs = await page
      .locator('main a, aside a')
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter((href) => new URL(href).origin === location.origin),
      );
    for (const href of hrefs) links.add(href);
  }
  const assets: string[] = [];
  for (const link of links) {
    const url = new URL(link);
    if (url.pathname.startsWith('/templates/')) {
      assets.push(link);
      continue;
    }
    expect(registered, `Unregistered docs link ${link}`).toContain(url.pathname);
    if (url.hash)
      expect(ids.get(url.pathname)?.has(decodeURIComponent(url.hash.slice(1))), link).toBe(true);
  }
  await Promise.all(
    assets.map(async (link) => {
      const asset = await page.request.get(link);
      expect(asset.status(), link).toBe(200);
      expect((await asset.body()).byteLength, link).toBeGreaterThan(0);
    }),
  );
  const missing = await page.goto('/this-guide-does-not-exist/');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('mobile navigation and article contents remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const guide = page
    .getByRole('navigation', { name: 'Documentation', exact: true })
    .locator('a:not([aria-current])')
    .first();
  const title = await guide.innerText();
  const guideUrl = await guide.evaluate((anchor) => (anchor as HTMLAnchorElement).href);
  await guide.click();
  await expect(page).toHaveURL(guideUrl);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await page.locator('summary', { hasText: 'On this page' }).click();
  const section = page.getByRole('navigation', { name: 'On this page' }).getByRole('link').last();
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
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Search terms' }),
  ).toBeFocused({ timeout: 15_000 });
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
  const contents = page.getByRole('navigation', { name: 'On this page' });
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
    .getByRole('banner')
    .evaluate((node) => node.getBoundingClientRect().bottom);
  expect(headingTop).toBeGreaterThanOrEqual(headerBottom);
});
