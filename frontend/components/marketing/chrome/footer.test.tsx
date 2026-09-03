import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { MarketingFooter } from './footer';

/**
 * The footer is a cached async server component with no islands, so resolve it
 * before rendering. What is worth pinning is the commercial contract: five columns, a
 * Compare column derived from the content module, and — because the repo is
 * private — no GitHub or documentation links anywhere on a commercial page.
 */
describe('MarketingFooter', () => {
  it('renders five labelled columns inside the Footer landmark', async () => {
    const { container } = render(await MarketingFooter());

    expect(container.querySelector('footer')).toHaveClass('bg-active/60');
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getAllByRole('link').length).toBeGreaterThan(0);
    const headings = within(footerNav).getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(5);
    for (const heading of headings) {
      expect(heading).toHaveClass('text-foreground', 'font-medium');
    }
  });

  it('derives the Compare column from the content module', async () => {
    render(await MarketingFooter());

    expect(screen.getByRole('link', { name: 'All comparisons' })).toHaveAttribute(
      'href',
      '/compare',
    );
    for (const competitor of COMPETITORS) {
      expect(screen.getByRole('link', { name: `vs ${competitor.name}` })).toHaveAttribute(
        'href',
        `/compare/${competitor.slug}`,
      );
    }
  });

  it('points the company column at the demo funnel and login', async () => {
    render(await MarketingFooter());

    expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute('href', DEMO_HREF);
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
  });

  it('carries no GitHub or documentation links (the repo is private)', async () => {
    render(await MarketingFooter());

    expect(screen.queryByRole('link', { name: /github/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /documentation/i })).toBeNull();
  });

  it('exposes the legal strip, with the corporate policies on the parent site', async () => {
    render(await MarketingFooter());

    // Privacy and Terms bind Cube27 and are published there, so the strip
    // must leave the site for them (in a new tab) rather than link a local
    // copy that would drift out of date.
    const legal = screen.getByRole('navigation', { name: 'Legal' });
    for (const [name, href] of [
      ['Terms of Service', PARENT_COMPANY.termsHref],
      ['Privacy Policy', PARENT_COMPANY.privacyHref],
    ] as const) {
      const link = within(legal).getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }

    // The product's own policies stay on this surface.
    expect(within(legal).getByRole('link', { name: 'Cookies' })).toHaveAttribute(
      'href',
      '/cookies',
    );
    expect(within(legal).getByRole('link', { name: 'AI Policy' })).toHaveAttribute(
      'href',
      '/ai-policy',
    );
  });

  it('names the parent company in the ownership line', async () => {
    render(await MarketingFooter());

    // The line reads "© 2026 CiteLadder. A Cube27 product." with Cube27 as a
    // link, so the text is split across nodes — match the paragraph's own
    // normalised content rather than a single text node.
    const footer = screen.getByRole('contentinfo');
    const ownership = within(footer).getByText(
      (_content, element) =>
        element?.tagName === 'P' && /a cube27 product/i.test(element.textContent ?? ''),
    );
    expect(ownership).toBeInTheDocument();
    expect(within(ownership).getByRole('link', { name: 'Cube27' })).toHaveAttribute(
      'href',
      PARENT_COMPANY.href,
    );
    expect(screen.getByRole('link', { name: 'Cube27 on LinkedIn' })).toHaveAttribute(
      'href',
      PARENT_COMPANY.linkedin,
    );
  });
});
