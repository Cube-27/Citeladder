import { describe, expect, it } from 'vite-plus/test';
import { render, screen, within } from '@testing-library/react';

import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { FOOTER_LEGAL_LINKS } from '@/lib/marketing-content/legal-documents';
import { PUBLISHED_PLATFORM } from '@/lib/marketing-content/nav';

import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('makes published platform destinations reachable from the footer', () => {
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    const footerNav = within(footer).getByRole('navigation', { name: 'Footer' });
    for (const item of PUBLISHED_PLATFORM) {
      expect(within(footerNav).getByRole('link', { name: item.title })).toHaveAttribute(
        'href',
        item.href,
      );
    }
  });

  it('links the research guides from the footer with descriptive labels', () => {
    render(<SiteFooter />);

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
    render(<SiteFooter />);

    expect(screen.queryByRole('link', { name: /book a demo/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /log in/i })).toBeNull();
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
    render(<SiteFooter />);

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => /github\.com\/cube-27/i.test(href))).toEqual([]);
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footerNav).getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://docs.citeladder.com/',
    );
  });

  it('links every CiteLadder policy exactly once, in the same tab', () => {
    render(<SiteFooter />);

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
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    const ownership = within(footer).getByText(
      (_content, element) =>
        element?.tagName === 'P' && /a cube27 product/i.test(element.textContent ?? ''),
    );
    expect(ownership).toBeInTheDocument();
    expect(ownership.textContent).not.toMatch(/© 1970/);
    expect(within(ownership).getByRole('link', { name: 'Cube27' })).toHaveAttribute(
      'href',
      PARENT_COMPANY.href,
    );
  });

  it('links the launch-directory badges to their CiteLadder listings', () => {
    render(<SiteFooter />);

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

  it('links the CiteLadder social profiles as icons named by their domains, outside the columns', () => {
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    const footerNav = within(footer).getByRole('navigation', { name: 'Footer' });
    const profiles = [
      ['github.com', 'https://github.com/abhij1306/CiteLadder'],
      ['x.com', 'https://x.com/CiteLadderAI'],
      ['linkedin.com', 'https://www.linkedin.com/company/citeladder'],
    ] as const;
    for (const [name, href] of profiles) {
      const link = within(footer).getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link.textContent).toBe('');
      expect(within(footerNav).queryByRole('link', { name })).toBeNull();
    }
  });
});
