import { render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { pathname } = vi.hoisted(() => ({ pathname: { value: '/visibility' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

import { PageHeader } from './page-header';
import { CompactPageTitleContext } from './compact-page-title-context';

function CompactTitleHarness({ children }: Readonly<{ children: ReactNode }>) {
  const [title, setTitle] = useState<string>();
  return (
    <CompactPageTitleContext.Provider value={setTitle}>
      <output data-testid="compact-title">{title}</output>
      {children}
    </CompactPageTitleContext.Provider>
  );
}

function renderTitle(route: string) {
  pathname.value = route;
  render(<PageHeader />);
  return screen.getByRole('heading', { level: 1 }).textContent;
}

describe('PageHeader', () => {
  it.each([
    ['/visibility', 'AI Visibility'],
    ['/ai-referrals', 'AI Referrals'],
    ['/performance', 'Performance'],
    ['/prompts', 'Prompts'],
    ['/opportunities', 'Opportunities'],
    ['/site', 'Website'],
    // The canonical Website route owns crawl detail beneath `/site`.
    ['/demand', 'Search Demand'],
  ])('resolves %s to the page title %s', (route, title) => {
    expect(renderTitle(route)).toBe(title);
  });

  it.each([
    ['/performance/anything', 'Performance'],
    ['/runs/abc', 'Run detail'],
    ['/runs/abc/executions/def', 'Execution evidence'],
    ['/products/abc', 'Commerce Suite'],
    ['/site/crawls/abc/pages/def', 'Page detail'],
  ])('resolves deeper route %s by longest-prefix match to %s', (route, title) => {
    expect(renderTitle(route)).toBe(title);
  });

  it('falls back to the product name for unknown routes', () => {
    expect(renderTitle('/nope')).toBe('CiteLadder');
  });

  it('accepts an explicit title override', () => {
    pathname.value = '/visibility';
    render(<PageHeader title="Custom" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Custom');
  });

  it('supplies an explicit title override to the compact shell', () => {
    render(
      <CompactTitleHarness>
        <PageHeader title="Custom" />
      </CompactTitleHarness>,
    );

    expect(screen.getByTestId('compact-title')).toHaveTextContent('Custom');
  });

  it('renders the route title as a level-one heading by default', () => {
    pathname.value = '/site';
    render(<PageHeader />);
    expect(screen.getByRole('heading', { level: 1, name: 'Website' })).toBeInTheDocument();
  });

  it('keeps the page-detail route title accessible', () => {
    pathname.value = '/site/crawls/crawl-id/pages/page-id';
    render(<PageHeader />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page detail' })).toBeInTheDocument();
  });
});
