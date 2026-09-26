import { expect, test } from '@playwright/test';

test.describe('marketing routes', () => {
  test('Google Analytics waits for an explicit cookie acceptance', async ({ page }) => {
    const tagRequests: string[] = [];
    await page.route('https://www.googletagmanager.com/gtag/js**', async (route) => {
      tagRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });

    await page.goto('/cookies');
    const consent = page.getByRole('region', { name: 'Cookie consent' });
    await expect(consent).toBeVisible();
    expect(tagRequests).toHaveLength(0);
    await consent.getByRole('button', { name: 'Reject' }).click();
    await page.reload();
    await expect(consent).toHaveCount(0);
    expect(tagRequests).toHaveLength(0);

    await page.evaluate(() => localStorage.removeItem('citeladder.cookie-consent'));
    await page.reload();
    await consent.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => tagRequests.length).toBe(1);
    expect(tagRequests[0]).toContain('id=G-CONSENTTEST');
  });

  test('four monitored surfaces stay visible with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['ChatGPT', 'Gemini', 'Claude', 'Google AI Overviews']) {
      await expect(roster.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(roster.getByText('DataForSEO')).toHaveCount(0);
  });

  test('Sources URLs keep the preview width stable at desktop and phone widths', async ({
    page,
  }) => {
    for (const width of [1280, 760, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('astro-island')].some(
          (island) =>
            island.getAttribute('component-url')?.includes('landing-page') &&
            !island.hasAttribute('ssr'),
        ),
      );
      const panel = page.getByRole('tabpanel', { name: /sources/i }).last();
      const card = panel.locator('.cl-product-card');
      if (width < 640) {
        await expect
          .poll(() =>
            panel
              .locator('.cl-product-preview > div')
              .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a),
          )
          .toBeLessThan(1);
      }
      await expect(card).toBeVisible();
      const before = await card.boundingBox();
      await panel.getByRole('button', { name: 'URLs' }).click();
      await expect(panel.getByText('zernovelle.example/platform')).toBeVisible();
      const after = await card.boundingBox();
      expect(
        Math.abs((after?.width ?? 0) - (before?.width ?? 0)),
        `${width}px width`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((after?.x ?? 0) - (before?.x ?? 0)),
        `${width}px position`,
      ).toBeLessThanOrEqual(1);
      const cardOverflow = await card.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      expect(cardOverflow, `${width}px card overflow`).toBeLessThanOrEqual(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px page overflow`).toBeLessThanOrEqual(1);
    }
  });

  test('phone scaling stays inside the three product illustration surfaces', async ({ page }) => {
    for (const width of [375, 760, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('astro-island')].some(
          (island) =>
            island.getAttribute('component-url')?.includes('landing-page') &&
            !island.hasAttribute('ssr'),
        ),
      );
      const hero = page.locator('.cl-hero-scaled-preview > div');
      const product = page
        .getByRole('tabpanel', { name: /sources/i })
        .last()
        .locator('.cl-product-preview > div');
      await expect(hero).toBeVisible();
      await expect(product).toBeVisible();
      if (width === 375) {
        for (const image of [hero, product]) {
          await expect
            .poll(() =>
              image.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a),
            )
            .toBeLessThan(1);
        }
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px landing overflow`).toBeLessThanOrEqual(1);
      expect(
        await page.locator('.cl-record').evaluate((element) => getComputedStyle(element).transform),
      ).toBe('none');

      await page.goto('/solutions');
      const solution = page.locator('.cl-solution-preview > div').first();
      await expect(solution).toBeVisible();
      if (width === 375) {
        await expect
          .poll(() =>
            solution.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a),
          )
          .toBeLessThan(1);
      }
      const solutionOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(solutionOverflow, `${width}px Solutions overflow`).toBeLessThanOrEqual(1);
    }
  });

  test('published content slugs return 200 and unknown slugs return 404', async ({ page }) => {
    for (const path of [
      '/blog/connecting-owned-evidence-ai-search',
      '/compare/profound',
      '/compare/otterly-ai',
      '/compare/scrunch-ai',
      '/compare/peec-ai',
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    }
    for (const path of [
      '/blog/hello-citeladder',
      '/blog/does-not-exist',
      '/docs/mcp',
      '/compare/does-not-exist',
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });

  test('shared navigation and footer work from a subpage', async ({ page }) => {
    await page.goto('/faq');
    const resources = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Resources', exact: true });
    await expect(resources).toHaveAttribute('href', '/blog');

    const footer = page.getByRole('navigation', { name: 'Footer' });
    await expect(footer.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Blog', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/',
    );
    await expect(footer.getByRole('link', { name: 'Changelog' })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/changelog/',
    );
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveCount(0);
  });
});
