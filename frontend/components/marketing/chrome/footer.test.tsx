import { describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, within } from '@testing-library/react';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { DEMO_HREF } from '@/lib/marketing-content/nav';
import { CITELADDER_LINKEDIN } from '@/lib/marketing-content/social';

import { MarketingFooter } from './footer';

/**
 * The footer is a cached async server component with no islands, so resolve it
 * before rendering. What is worth pinning is the commercial contract: five columns, a
 * Compare column derived from the content module, and — because the repo is
 * private — no GitHub or documentation links anywhere on a commercial page.
 */
describe('MarketingFooter', () => {
  it('renders five labelled columns inside the Footer landmark', async () => {
    render(await MarketingFooter());

    const footer = screen.getByRole('contentinfo');
    const footerNav = within(footer).getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getAllByRole('link').length).toBeGreaterThan(0);
    const headings = within(footerNav).getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(5);
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
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(await MarketingFooter());

    expect(screen.getByRole('link', { name: /book a demo/i })).toHaveAttribute('href', DEMO_HREF);
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute(
      'href',
      'https://app.citeladder.com/login',
    );
    vi.unstubAllEnvs();
  });

  it('links to public documentation but not the private repository', async () => {
    render(await MarketingFooter());

    expect(screen.queryByRole('link', { name: /github/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/',
    );
  });

  it('links every CiteLadder policy exactly once, in the same tab', async () => {
    render(await MarketingFooter());

    // The policies are CiteLadder's own pages on this domain, so none of them
    // may leave the site the way the former parent-company links did.
    const footer = screen.getByRole('contentinfo');
    for (const { label, href } of FOOTER_LEGAL_LINKS) {
      const links = within(footer)
        .getAllByRole('link', { name: label })
        .filter((link) => link.getAttribute('href') === href);
      expect(links, href).toHaveLength(1);
      expect(links[0]).not.toHaveAttribute('target');
    }
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
    expect(screen.getByRole('link', { name: 'CiteLadder on LinkedIn' })).toHaveAttribute(
      'href',
      CITELADDER_LINKEDIN,
    );
  });
});
