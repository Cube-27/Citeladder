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

    // The hero's action is the first one on the page; the closing band repeats it.
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

  it('links each pillar module by its published name', () => {
    render(<LandingPage />);

    const pillars = screen.getByRole('region', { name: 'Measure, diagnose, improve' });
    expect(within(pillars).getByRole('link', { name: 'Keyword Research' })).toHaveAttribute(
      'href',
      '/platform/keyword-research',
    );
    expect(within(pillars).getByRole('link', { name: 'MCP' })).toHaveAttribute(
      'href',
      '/platform/mcp',
    );
  });
});
