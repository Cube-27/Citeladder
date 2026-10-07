import { describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, within } from '@testing-library/react';

import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { DEMO_HREF, PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';
import { CITELADDER_LINKEDIN } from '@/lib/marketing-content/social';

import { MarketingFooter } from './footer';

/**
 * The footer is a cached async server component with no islands, so resolve it
 * before rendering. Cover published destinations, account entry and legal links.
 */
describe('MarketingFooter', () => {
  it('makes published platform destinations reachable from the footer', async () => {
    render(await MarketingFooter());

    const footer = screen.getByRole('contentinfo');
    const footerNav = within(footer).getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getAllByRole('link').length).toBeGreaterThan(0);
    for (const item of PUBLISHED_PLATFORM) {
      const scope = item.href === '/platform' ? footer : footerNav;
      expect(within(scope).getByRole('link', { name: item.title })).toHaveAttribute(
        'href',
        item.href,
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
    expect(screen.getByRole('link', { name: 'AI Instructions' })).toHaveAttribute(
      'href',
      '/ai-instructions',
    );
    expect(screen.getByRole('link', { name: 'Entity Map' })).toHaveAttribute('href', '/entity-map');
    vi.unstubAllEnvs();
  });

  it('links to public documentation but not the private repository', async () => {
    render(await MarketingFooter());

    expect(screen.queryByRole('link', { name: /github/i })).toBeNull();
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/',
    );
  });

  it('links every CiteLadder policy exactly once, in the same tab', async () => {
    render(await MarketingFooter());

    // The policies are CiteLadder's own pages on this domain, so none of them
    // may leave the site the way the former parent-company links did.
    for (const { label, href } of FOOTER_LEGAL_LINKS) {
      const scope = screen.getByRole('navigation', {
        name: href === '/contact' ? 'Footer' : 'Legal',
      });
      const links = within(scope)
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
    expect(
      within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', {
        name: 'CiteLadder on LinkedIn',
      }),
    ).toHaveAttribute('href', CITELADDER_LINKEDIN);
  });
});
