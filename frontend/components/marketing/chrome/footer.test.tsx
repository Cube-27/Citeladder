import { describe, expect, it } from 'vite-plus/test';
import { render, screen, within } from '@testing-library/react';

import { FOOTER_LEGAL_LINKS, PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';

import { MarketingFooter } from './footer';

/**
 * The footer is a static server-rendered component with no islands. Cover
 * published destinations, account entry and legal links.
 */
describe('MarketingFooter', () => {
  it('makes published platform destinations reachable from the footer', () => {
    render(<MarketingFooter />);

    const footer = screen.getByRole('contentinfo');
    const footerNav = within(footer).getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getAllByRole('link').length).toBeGreaterThan(0);
    for (const item of PUBLISHED_PLATFORM) {
      expect(within(footerNav).getByRole('link', { name: item.title })).toHaveAttribute(
        'href',
        item.href,
      );
    }
  });

  it('links the research guides from the footer with descriptive labels', () => {
    render(<MarketingFooter />);

    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(
      within(footerNav).getByRole('link', { name: 'Google AI Overviews statistics' }),
    ).toHaveAttribute('href', '/blog/google-ai-overviews-statistics-2026');
    expect(within(footerNav).getByRole('link', { name: 'Profound alternatives' })).toHaveAttribute(
      'href',
      '/compare/profound-alternatives',
    );
  });

  it('carries no account or demo actions, only destinations and references', () => {
    render(<MarketingFooter />);

    expect(screen.queryByRole('link', { name: /book a demo/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /log in/i })).toBeNull();
    // The AI references sit in the Company column, not the legal strip.
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getByRole('link', { name: 'AI Instructions' })).toHaveAttribute(
      'href',
      '/ai-instructions',
    );
    expect(within(footerNav).getByRole('link', { name: 'Entity Map' })).toHaveAttribute(
      'href',
      '/entity-map',
    );
  });

  it('links to public documentation but not the private repository', () => {
    render(<MarketingFooter />);

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => /github\.com\/cube-27/i.test(href))).toEqual([]);
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/',
    );
  });

  it('links every CiteLadder policy exactly once, in the same tab', () => {
    render(<MarketingFooter />);

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

  it('names the parent company in the ownership line', () => {
    render(<MarketingFooter />);

    // The line reads "© 2026 CiteLadder. A Cube27 product." with Cube27 as a
    // link, so the text is split across nodes — match the paragraph's own
    // normalised content rather than a single text node.
    const footer = screen.getByRole('contentinfo');
    const ownership = within(footer).getByText(
      (_content, element) =>
        element?.tagName === 'P' && /a cube27 product/i.test(element.textContent ?? ''),
    );
    expect(ownership).toBeInTheDocument();
    // Guard against the epoch year leaking into the copyright line.
    expect(ownership.textContent).not.toMatch(/© 1970/);
    expect(within(ownership).getByRole('link', { name: 'Cube27' })).toHaveAttribute(
      'href',
      PARENT_COMPANY.href,
    );
  });

  it('links the launch-directory badges to their CiteLadder listings', () => {
    render(<MarketingFooter />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Featured on CodeHype' })).toHaveAttribute(
      'href',
      'https://www.codehype.ai/product/citeladder?utm_source=codehype_badge',
    );
    expect(within(footer).getByRole('link', { name: 'Featured on Launch' })).toHaveAttribute(
      'href',
      'https://tools.launchllama.co/products/citeladder?utm_source=badge&utm_medium=referral',
    );
  });

  it('links the CiteLadder social profiles by their domains', () => {
    render(<MarketingFooter />);

    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getByRole('link', { name: 'x.com' })).toHaveAttribute(
      'href',
      'https://x.com/CiteLadderAI',
    );
    expect(within(footerNav).getByRole('link', { name: 'linkedin.com' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/company/citeladder',
    );
    expect(within(footerNav).getByRole('link', { name: 'github.com' })).toHaveAttribute(
      'href',
      'https://github.com/abhij1306/CiteLadder',
    );
  });
});
