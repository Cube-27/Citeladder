import { expect, test } from '@playwright/test';
import { SHARE_OF_VOICE_PAGE } from '@/lib/marketing-content/commercial-pages';
import { PLATFORM_PAGES } from '@/lib/marketing-content/platform-pages';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { DEMO_HREF } from '@/lib/marketing-content/nav';
import { POSTS } from '@/lib/marketing-content/blog';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { filterAndSortPosts, toBlogPostSummary } from '@/lib/marketing-content/blog-index';

test.describe('marketing routes', () => {
  test('published platform pages render linked evidence and metadata without JavaScript', async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await context.newPage();
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const item of PUBLISHED_PLATFORM) {
      const copy = PLATFORM_PAGES.find((entry) => entry.path === item.href)!;
      const response = await page.goto(item.href);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(copy.title);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(copy.heading);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new URL(item.href, baseURL).href,
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        copy.description,
      );
      await expect(page.locator('main')).toContainText(copy.lead);
      await expect(page.locator('main figure').first()).toContainText('Illustrative example');
      const schemas = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent ?? '{}')));
      const product = schemas.find((schema) => schema['@type'] === 'WebApplication');
      expect(schemas.find((schema) => schema['@type'] === 'WebPage')?.about['@id']).toBe(
        product['@id'],
      );
      expect(schemas.filter((schema) => schema['@type'] === 'FAQPage')).toHaveLength(0);
      expect(sitemap).toContain(`<loc>${new URL(item.href, baseURL).href}</loc>`);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          item.href,
        ).toBe(true);
      }
      for (const href of copy.related) {
        await expect(page.locator(`main a[href="${href}"]`).first()).toBeAttached();
        expect((await request.get(href)).status()).toBe(200);
      }
    }
    for (const path of ['/platform/not-published', '/platform/crawler-analytics']) {
      expect((await request.get(path)).status()).toBe(404);
    }
    const redirect = await request.get('/platform/site-health/?source=test', { maxRedirects: 0 });
    expect(redirect.status()).toBe(301);
    expect(redirect.headers().location).toBe('/platform/site-health?source=test');
    await page.goto('/ai-citation-tracking');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(
      page.locator('main a[href="/platform/citation-intelligence"]').first(),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new URL('/ai-citation-tracking', baseURL).href,
    );
    await context.close();
  });

  test('free tools hub opens a usable crawler checker and rejects unknown tools', async ({
    page,
  }) => {
    await page.goto('/tools');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Test your rules' }).click();
    await expect(page).toHaveURL(/\/tools\/ai-crawler-checker$/);
    await page.waitForFunction(() => !document.querySelector('astro-island[ssr]'));
    await page.getByRole('button', { name: 'Load example' }).click();
    await page.getByRole('button', { name: 'Test crawler rules' }).click();
    await expect(page.getByRole('textbox', { name: 'Generated output' })).toHaveValue(
      /Blocked by supplied rules/,
    );
    const missing = await page.goto('/tools/not-a-tool');
    expect(missing?.status()).toBe(404);
  });

  test('homepage FAQ remains visible without adding FAQ rich-result markup', async ({ page }) => {
    await page.goto('/');
    const { schemas, visible } = await page.evaluate(() => ({
      schemas: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((script) => JSON.parse(script.textContent ?? '{}'))
        .filter((schema) => schema['@type'] === 'FAQPage'),
      visible: [...document.querySelectorAll('#landing-faq details')].map((faq) => ({
        '@type': 'Question',
        name: faq.querySelector('summary')?.textContent?.trim(),
        acceptedAnswer: { '@type': 'Answer', text: faq.querySelector('p')?.textContent?.trim() },
      })),
    }));
    expect(visible.length).toBeGreaterThan(0);
    expect(schemas).toHaveLength(0);
  });

  test('product frames keep their size and position through hydration', async ({
    browser,
    baseURL,
  }) => {
    for (const width of [375, 1280]) {
      for (const path of ['/', '/solutions']) {
        const context = await browser.newContext({
          baseURL,
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        let releaseScripts!: () => void;
        const scriptsReleased = new Promise<void>((resolve) => {
          releaseScripts = resolve;
        });
        await page.route('**/_astro/*.js', async (route) => {
          await scriptsReleased;
          await route.continue();
        });
        await page.goto(path, { waitUntil: 'commit' });
        const frames = page.locator('main .product-frame');
        await expect(frames.first()).toBeVisible();
        await page.waitForFunction(() =>
          [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].every(
            (stylesheet) => stylesheet.sheet !== null,
          ),
        );
        // WebKit's fonts.ready waits for document readiness, which the held
        // module scripts prevent. Load the used faces without that dependency.
        // Builds without the private font files settle on the fallback faces.
        await page.evaluate(() =>
          Promise.allSettled(
            [
              '400 16px "Satoshi Variable"',
              '600 16px "Satoshi Variable"',
              '600 16px "Sentient Variable"',
            ].map((font) => document.fonts.load(font)),
          ),
        );
        const boxes = () =>
          frames.evaluateAll((elements) =>
            elements.map((element) => {
              const { y, width, height } = element.getBoundingClientRect();
              return { y, width, height };
            }),
          );
        const before = await boxes();
        releaseScripts();
        await page.waitForLoadState('networkidle');
        if (path === '/')
          await expect(page.getByRole('tab', { name: 'Visibility', exact: true })).toBeVisible();
        const after = await boxes();
        for (let index = 0; index < before.length; index += 1) {
          expect(before[index]!.height).toBeGreaterThan(0);
          expect(
            Math.abs(after[index]!.height - before[index]!.height),
            `${path} at ${width}px: preview height`,
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(after[index]!.y - before[index]!.y),
            `${path} at ${width}px: preview position`,
          ).toBeLessThanOrEqual(1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await context.close();
      }
    }
  });

  test('contact form supports validation, delivery retry and success at public viewport sizes', async ({
    page,
  }) => {
    let attempts = 0;
    await page.route('**/api/v1/contact', async (route) => {
      const enquiry = route.request().postDataJSON();
      expect(enquiry).toMatchObject({
        name: 'Ada',
        email: 'ada@example.com',
        company: '',
        message: 'Please show us CiteLadder.',
      });
      attempts += 1;
      await route.fulfill({
        status: attempts % 2 === 1 ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: attempts % 2 === 1 ? 'send_failed' : 'success' }),
      });
    });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/contact');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('astro-island')].some(
          (island) =>
            island.getAttribute('component-url')?.includes('/contact.') &&
            !island.hasAttribute('ssr'),
        ),
      );
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Talk to the CiteLadder team.',
      );
      await expect(page).toHaveTitle('Contact CiteLadder');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: test.info().outputPath(`contact-${width}.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      const name = page.getByRole('textbox', { name: /^Name/ });
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toBeFocused();
      await name.fill('Ada');
      await page.getByRole('textbox', { name: /^Work email/ }).fill('ada@example.com');
      await page
        .getByRole('textbox', { name: /^How can we help/ })
        .fill('Please show us CiteLadder.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText("We couldn't send your message.");
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Message sent' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Message sent' })).toBeFocused();
      await page.getByRole('button', { name: 'Send another message' }).click();
      await expect(name).toHaveValue('');
    }
  });

  test('guides and comparisons deliver their evidence and contextual links without JavaScript', async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const guides = POSTS.filter((post) => post.editorialNote);
    const pages = [
      ...guides.map((post) => ({
        path: `/blog/${post.slug}`,
        title: post.seoTitle,
        heading: post.title,
        description: post.seoDescription,
      })),
      ...COMPETITORS.map((competitor) => ({
        path: `/compare/${competitor.slug}`,
        title: competitor.metaTitle,
        heading: `CiteLadder vs ${competitor.name}`,
        description: competitor.metaDescription,
      })),
    ];
    const visited = new Set<string>();
    for (const entry of pages) {
      const response = await request.get(entry.path);
      expect(response.status()).toBe(200);
      const initial = await page.evaluate(
        (html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          return {
            title: doc.title,
            description: doc.querySelector('meta[name="description"]')?.getAttribute('content'),
            canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
            headings: [...doc.querySelectorAll('h1')].map((heading) => heading.textContent?.trim()),
            links: [...doc.querySelectorAll('main a[href]')].map((link) =>
              link.getAttribute('href')!,
            ),
            text: doc.querySelector('main')?.textContent,
          };
        },
        await response.text(),
      );
      expect(initial.title).toBe(entry.title);
      expect(initial.description).toBe(entry.description);
      expect(initial.headings).toEqual([entry.heading]);
      expect(initial.canonical).toBe(
        new URL(entry.path, process.env.PUBLIC_WEBSITE_ORIGIN ?? baseURL).href,
      );
      expect(initial.links).toContain(DEMO_HREF);
      for (const href of initial.links.filter(
        (href) => href.startsWith('/') && !visited.has(href),
      )) {
        visited.add(href);
        expect((await request.get(href)).status(), `${entry.path} → ${href}`).toBe(200);
      }
      const post = guides.find((post) => entry.path === `/blog/${post.slug}`);
      if (post) {
        for (const block of post.body) {
          if (block.type === 'paragraph') expect(initial.text).toContain(block.text);
        }
      }
      const competitor = COMPETITORS.find(
        (competitor) => entry.path === `/compare/${competitor.slug}`,
      );
      if (competitor) {
        expect(initial.text).toContain(competitor.lead);
        expect(initial.links).toContain(competitor.sources[0]!.url);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(entry.path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const demo = page.locator('main').getByRole('link', { name: 'Book a demo' }).first();
      await demo.focus();
      await expect(demo).toBeFocused();
    }
    for (const path of ['/blog', '/compare', '/solutions']) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: test.info().outputPath(`${path.slice(1)}-${width}.png`),
          fullPage: true,
        });
      }
    }
    await context.close();
  });

  test('blog topic filters and sorting retain article navigation without a thumbnail', async ({
    page,
  }) => {
    const waitForBlog = () =>
      page.waitForFunction(() =>
        [...document.querySelectorAll('astro-island')].some(
          (island) =>
            island.getAttribute('component-url')?.includes('/blog.') && !island.hasAttribute('ssr'),
        ),
      );
    await page.goto('/blog');
    await waitForBlog();
    const archive = page.getByRole('region', { name: 'Blog articles' });
    await archive.getByRole('button', { name: 'Website readiness', exact: true }).click();
    const card = archive.locator('article');
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('img')).toHaveCount(0);
    await card.getByRole('link', { name: 'Read article' }).click();
    await expect(page).toHaveURL(/\/blog\/auditing-content-for-llms-ai-search$/);
    await expect(
      page.getByRole('navigation', { name: 'Previous and next articles' }),
    ).toBeVisible();
    await page.goto('/blog');
    await waitForBlog();
    await archive.getByRole('button', { name: 'All posts', exact: true }).click();
    await archive.getByRole('combobox', { name: 'Sort', exact: true }).click();
    await page.getByRole('option', { name: 'Oldest' }).click();
    const expected = filterAndSortPosts(POSTS.map(toBlogPostSummary), null, 'oldest').map(
      (post) => post.title,
    );
    await expect(archive.locator('article h2')).toHaveText(expected);
  });
  test('commercial entry pages deliver indexable copy and usable links without JavaScript', async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const entries = [{ path: '/ai-search-share-of-voice', copy: SHARE_OF_VOICE_PAGE }];
    for (const { path, copy } of entries) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      // Parse the HTTP response itself, before hydration or browser rendering.
      const initial = await page.evaluate(
        (html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          return {
            headings: [...doc.querySelectorAll('h1')].map((h) => h.textContent),
            text: doc.querySelector('main')?.textContent,
            canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
            title: doc.title,
            socialTitle: doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
            description: doc.querySelector('meta[name="description"]')?.getAttribute('content'),
            socialDescription: doc
              .querySelector('meta[property="og:description"]')
              ?.getAttribute('content'),
          };
        },
        await response.text(),
      );
      expect(initial.headings).toHaveLength(1);
      if (path === '/ai-search-share-of-voice') expect(initial.headings).toEqual([copy.heading]);
      expect(initial.text).toContain(copy.introduction);
      expect(initial.canonical).toBe(
        new URL(path, process.env.PUBLIC_WEBSITE_ORIGIN ?? baseURL).href,
      );
      expect(initial.socialTitle).toBe(initial.title.replace(/ · CiteLadder$/, ''));
      expect(initial.socialDescription).toBe(initial.description);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const demo = page.locator('main').getByRole('link', { name: 'Book a demo' }).first();
        await demo.focus();
        await expect(demo).toBeFocused();
        await expect(demo).toHaveAttribute('href', DEMO_HREF);
        const faq = page.locator('main details').first();
        await faq.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(faq.locator('p')).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(faq.locator('p')).toBeHidden();
        for (const target of [copy.secondary.href, '/solutions', '/pricing']) {
          const link = page.locator(`main a[href="${target}"]`).first();
          await expect(link).toBeAttached();
          expect((await request.get(target)).status()).toBe(200);
        }
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: test.info().outputPath(`${path.slice(1)}-${width}.png`),
          fullPage: true,
        });
      }
      await page.goto('/compare');
      await expect(page.locator(`main a[href="${path}"]`)).toBeVisible();
    }
    expect((await request.get('/ai-citation-tracking/does-not-exist')).status()).toBe(404);
    await context.close();
  });
  test('public paper surfaces and long tabs stay usable across viewport sizes', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const strip = page.getByRole('tablist', { name: 'Product tour' });
      await strip.scrollIntoViewIfNeeded();
      const last = strip.getByRole('tab').last();
      await last.focus();
      await expect(last).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: test.info().outputPath(`marketing-${width}.png`),
        fullPage: true,
      });
    }
  });
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

  test('collection sources stay distinguishable with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const roster = page.getByRole('region', { name: 'Monitored answer engines' });
    for (const name of ['OpenAI API', 'Gemini API', 'Claude API', 'Google AI Overviews']) {
      await expect(roster.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(roster.getByText('DataForSEO')).toHaveCount(0);
  });

  test('product frames fit the viewport on the landing and Solutions pages', async ({ page }) => {
    for (const width of [375, 760, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/solutions']) {
        await page.goto(path);
        const frames = page.locator('main .product-frame');
        await expect(frames.first()).toBeVisible();
        const widest = await frames.evaluateAll((elements) =>
          Math.max(...elements.map((element) => element.getBoundingClientRect().right)),
        );
        expect(widest, `${path} at ${width}px: frame edge`).toBeLessThanOrEqual(width + 1);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px overflow`).toBeLessThanOrEqual(1);
      }
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
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Resources', exact: true }).click();
    await expect(nav.getByRole('link', { name: /Blog & guides/ })).toHaveAttribute('href', '/blog');

    const footer = page.getByRole('navigation', { name: 'Footer' });
    await expect(footer.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Blog & guides', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Documentation', exact: true })).toHaveAttribute(
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
