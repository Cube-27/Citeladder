import { expect, test } from '@playwright/test';
import { NAV_DROPS } from '@/lib/marketing-content/nav';

/** Derived from the nav config so a content edit cannot silently pass. */
const RESOURCES_LINK_COUNT = NAV_DROPS.find((drop) => drop.key === 'resources')!.groups.reduce(
  (sum, group) => sum + group.items.length,
  0,
);

test.describe('marketing routes', () => {
  test('homepage clocks stop offscreen and reduced motion keeps the engine roster readable', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const roster = page.getByRole('img', {
      name: 'ChatGPT, Grok, Gemini, Copilot, Claude and Perplexity.',
    });
    const runningClocks = () =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === 'running' &&
                animation.timeline === document.timeline &&
                animation.effect?.getTiming().iterations === Infinity,
            ).length,
      );

    await roster.scrollIntoViewIfNeeded();
    await expect.poll(runningClocks).toBeGreaterThan(0);
    expect(await runningClocks()).toBeLessThanOrEqual(3);
    await page.getByRole('navigation', { name: 'Footer' }).scrollIntoViewIfNeeded();
    await expect.poll(runningClocks).toBe(0);
    await roster.scrollIntoViewIfNeeded();
    await expect.poll(runningClocks).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(runningClocks).toBe(0);
    for (const engine of ['ChatGPT', 'Grok', 'Gemini', 'Copilot', 'Claude', 'Perplexity']) {
      await expect(
        roster.getByText(engine, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
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
    await resources.hover();
    await expect(page.locator('#desktop-nav-panel-resources')).toBeVisible();
    await expect(page.locator('#desktop-nav-panel-resources').getByRole('link')).toHaveCount(
      RESOURCES_LINK_COUNT,
    );

    const footer = page.getByRole('navigation', { name: 'Footer' });
    await expect(footer.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Blog', exact: true })).toBeVisible();
    // The repo is private — no Documentation/GitHub links in the footer.
    await expect(footer.getByRole('link', { name: 'Documentation' })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveCount(0);
  });
});
