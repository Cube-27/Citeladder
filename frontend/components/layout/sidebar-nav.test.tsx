import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn((_options: { queryKey: readonly unknown[] }) => Promise.resolve()),
  // `prefetchRoute` skips keys whose query already failed, so the stub client
  // needs the cache lookup that guard performs. Nothing has failed here.
  find: vi.fn((_filters: { queryKey: readonly unknown[] }) => undefined),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    prefetchQuery: mocks.prefetchQuery,
    getQueryCache: () => ({ find: mocks.find }),
  }),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: { id: '11111111-1111-4111-8111-111111111111' } }),
}));

vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ hasCapability: (key: string) => key === 'content_creation' }),
}));

let pathname = '/site';
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

import { SidebarNav } from './sidebar-nav';
import { NAV_GROUPS, resolveCommandGroups, resolveNavigationGroups } from './nav-items';

describe('station navigation', () => {
  beforeEach(() => {
    mocks.prefetchQuery.mockClear();
    mocks.find.mockClear();
  });

  it('ships the four loop stations and their canonical destinations', () => {
    render(<SidebarNav />);
    expect(NAV_GROUPS.map((group) => group.title)).toEqual(['Overview', 'Analyze', 'Act', 'Track']);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      '/site?tab=pages',
    );
    expect(screen.getByRole('link', { name: 'Opportunities' })).toHaveAttribute(
      'href',
      '/opportunities',
    );
    expect(screen.getByRole('link', { name: 'Commerce Suite' })).toHaveAttribute(
      'href',
      '/products',
    );
    expect(screen.getByRole('link', { name: 'Prompts' })).toHaveAttribute('href', '/prompts');
    expect(screen.queryByRole('link', { name: 'Growth Agent' })).not.toBeInTheDocument();
  });

  it('uses the same capability result for sidebar and command destinations', () => {
    const canUse = (capability: string) => capability !== 'content_creation';
    const sidebarLabels = resolveNavigationGroups(canUse)
      .flatMap((group) => group.items)
      .map((item) => item.label);
    const commandLabels = resolveCommandGroups(canUse)
      .flatMap((group) => group.items)
      .map((item) => item.label);

    expect(sidebarLabels).not.toContain('Content');
    expect(commandLabels).not.toContain('Content');
    expect(commandLabels).toEqual([...sidebarLabels, 'Integrations', 'Providers', 'Settings']);
  });

  it('uses query-aware active state for station destinations', () => {
    pathname = '/site';
    searchParams = new URLSearchParams('tab=pages');
    render(<SidebarNav />);
    const activeLink = screen.getByRole('link', { name: 'Website' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  it('calls the compact drawer close owner after choosing a destination', () => {
    const onNavigate = vi.fn();
    render(<SidebarNav onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: 'Website' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('omits section heading for Overview but renders headings for other stations', () => {
    render(<SidebarNav />);
    expect(screen.queryByText('Overview', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByText('Analyze', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Act', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Track', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Connect', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('prefetches the destination primary query on pointer and keyboard intent', () => {
    render(<SidebarNav />);
    const performance = screen.getByRole('link', { name: 'Performance' });
    fireEvent.mouseEnter(performance);
    expect(mocks.prefetchQuery).toHaveBeenCalled();
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual([
      'performance',
      'dashboard',
      '11111111-1111-4111-8111-111111111111',
      { range: 'custom', compare: 'none' },
    ]);

    mocks.prefetchQuery.mockClear();
    mocks.find.mockClear();
    fireEvent.focus(performance);
    expect(mocks.prefetchQuery).toHaveBeenCalledOnce();
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual([
      'performance',
      'dashboard',
      '11111111-1111-4111-8111-111111111111',
      { range: 'custom', compare: 'none' },
    ]);
  });
});
