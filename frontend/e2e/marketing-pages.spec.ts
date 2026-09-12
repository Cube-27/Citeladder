import { expect, test } from '@playwright/test';
import { NAV_DROPS } from '@/lib/marketing-content/nav';

/** Derived from the nav config so a content edit cannot silently pass. */
const RESOURCES_LINK_COUNT = NAV_DROPS.find((drop) => drop.key === 'resources')!.groups.reduce(
  (sum, group) => sum + group.items.length,
  0,
);

test.describe('marketing routes', () => {
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
    await page.goto('/pricing');
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
