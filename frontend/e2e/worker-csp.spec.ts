import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function checkInjectedBeacon(page: Page) {
  const url = 'https://static.cloudflareinsights.com/beacon.min.js/test-version';
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'document.documentElement.dataset.beacon = "loaded"',
    }),
  );
  await page.evaluate((src) => {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }, url);
  await expect(page.locator('html')).toHaveAttribute('data-beacon', 'loaded');
}

test('built app hydrates root, deep links and direct HTML while blocking injected scripts', async ({
  page,
}) => {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Sign in' } }),
    }),
  );
  for (const path of ['/', '/login', '/index.html']) {
    const response = await page.goto(`https://127.0.0.1:8793${path}`);
    expect(response?.headers()['content-security-policy']).toBeTruthy();
    expect(response?.headers()['cache-control']).toBe('no-store');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.getByRole('heading', { name: /sign in|welcome back/i })).toBeVisible();
  }
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "executed"';
    document.body.append(script);
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-injected', 'executed');
  await checkInjectedBeacon(page);
  await page.evaluate(() => localStorage.setItem('citeladder.theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('built marketing hydrates with one enforced header and blocks injected scripts', async ({
  page,
}) => {
  await page.route('https://www.googletagmanager.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: '',
    }),
  );
  await page.route('https://www.google-analytics.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://region1.google-analytics.com/**', (route) =>
    route.fulfill({ body: '' }),
  );
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/violates.*(security policy|directive)/i.test(message.text()))
      violations.push(message.text());
  });
  for (const path of ['/', '/pricing', '/privacy']) {
    const response = await page.goto(`https://127.0.0.1:8794${path}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toBeTruthy();
    expect(response?.headers()['x-robots-tag']).toBeUndefined();
    await expect(page.locator('meta[http-equiv="content-security-policy"]')).toHaveCount(0);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('astro-island')].every((island) => !island.hasAttribute('ssr')),
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.injected = "executed"';
    document.body.append(script);
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-injected', 'executed');
  await checkInjectedBeacon(page);
  const missing = await page.request.get('https://127.0.0.1:8794/not-a-page.html');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-security-policy']).toBeTruthy();
});
