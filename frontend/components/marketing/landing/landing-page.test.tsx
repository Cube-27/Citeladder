import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { LandingPage } from './landing-page';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LandingPage', () => {
  it.each([
    ['true', 'Start free trial', 'https://app.citeladder.com/register'],
    ['false', 'Book a demo', '/contact'],
  ])('routes the hero action with self-serve signup %s', (enabled, label, href) => {
    vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: label })[0]).toHaveAttribute('href', href);
  });

  it('opens on the MCP announcement above the headline', () => {
    render(<LandingPage />);

    const [announcement] = screen.getAllByRole('link');
    expect(announcement).toHaveAttribute('href', '/platform/mcp');
  });
  it('shows the app page as a picture without a second page heading', () => {
    render(<LandingPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('never skips a heading level: the app picture holds no headings of the page', () => {
    render(<LandingPage />);

    const levels = screen.getAllByRole('heading').map((heading) => Number(heading.tagName[1]));
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBe(2);
    const skips = levels.filter((level, index) => index > 0 && level - levels[index - 1]! > 1);
    expect(skips).toEqual([]);
  });

  it('shows one card per module in navigation order, leaving Integrations to its own section', () => {
    render(<LandingPage />);

    const rail = screen.getByRole('list', { name: 'modules' });
    const cards = within(rail).getAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/platform/ai-visibility',
      '/platform/cited-sources',
      '/platform/ai-referral-analytics',
      '/platform/product-visibility',
      '/platform/site-health',
      '/platform/search-demand',
      '/platform/keyword-research',
      '/platform/content-optimization',
      '/platform/agents',
      '/platform/mcp',
    ]);
    const keywords = within(rail).getByRole('heading', {
      name: 'Research keywords, competitors and backlinks.',
    });
    expect(within(keywords).getByRole('link')).toHaveAttribute(
      'href',
      '/platform/keyword-research',
    );
    expect(
      within(rail).getByRole('button', { name: 'More about Keyword Research' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('links the evidence split to its modules by their published names', () => {
    render(<LandingPage />);

    const evidence = screen.getByRole('region', { name: 'Evidence' });
    expect(within(evidence).getByRole('link', { name: 'Cited Sources' })).toHaveAttribute(
      'href',
      '/platform/cited-sources',
    );
  });
});
