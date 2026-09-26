import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

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
  // Query-options factories are typed identity at runtime; the route
  // prefetchers call them to build the key asserted below.
  queryOptions: <T,>(options: T) => options,
}));

vi.mock('@/lib/project/project-context', () => ({
  useActiveWorkspaceId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  useProjectContext: () => ({
    activeProject: { id: '11111111-1111-4111-8111-111111111111' },
    activeProjectId: '11111111-1111-4111-8111-111111111111',
    activeWorkspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }),
}));

vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ hasCapability: (key: string) => key === 'agent' }),
}));

let pathname = '/site';
let searchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
    createElement('a', { ...props, href: to }, children),
  useLocation: () => ({ pathname, search: '' }),
  useSearchParams: () => [searchParams, vi.fn()],
}));

import { SidebarNav } from './sidebar-nav';
import { NAV_GROUPS, resolveCommandGroups, resolveNavigationGroups } from './nav-items';

// The key the Performance screen's own landing selection reads, so a hover
// warms exactly the entry the destination consumes.
const PERFORMANCE_LANDING_KEY = [
  'performance',
  'dashboard',
  '11111111-1111-4111-8111-111111111111',
  { range: 'last_synced', granularity: 'day', compare: 'none' },
];

describe('station navigation', () => {
  beforeEach(() => {
    pathname = '/site';
    window.sessionStorage.clear();
    mocks.prefetchQuery.mockClear();
    mocks.find.mockClear();
  });

  it('ships the Dashboard stations and their canonical destinations', () => {
    render(<SidebarNav />);
    expect(NAV_GROUPS.map((group) => group.title)).toEqual(['Overview', 'Analyze', 'Track']);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      '/site?tab=pages&project=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.queryByRole('link', { name: 'Opportunities' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Commerce Suite' })).toHaveAttribute(
      'href',
      '/products?project=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByRole('link', { name: 'Prompts' })).toHaveAttribute(
      'href',
      '/prompts?project=11111111-1111-4111-8111-111111111111',
    );
  });

  it('uses the same capability result for sidebar and command destinations', () => {
    const canUse = (capability: string) => capability !== 'agent';
    const sidebarLabels = resolveNavigationGroups(canUse)
      .flatMap((group) => group.items)
      .map((item) => item.label);
    const commandLabels = resolveCommandGroups(canUse)
      .flatMap((group) => group.items)
      .map((item) => item.label);

    expect(sidebarLabels).not.toContain('Content');
    expect(commandLabels).not.toContain('Content');
    expect(commandLabels).toEqual([
      ...sidebarLabels,
      'New chat',
      'Actions',
      'Skills',
      'Context',
      'Integrations',
      'Providers',
      'Billing',
      'Settings',
    ]);
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

  it('derives the Dashboard | Agent mode from the route', () => {
    pathname = '/site';
    const { unmount } = render(<SidebarNav />);
    const modes = screen.getByRole('navigation', { name: 'Mode' });
    expect(within(modes).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(modes).getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      '/agent?project=11111111-1111-4111-8111-111111111111',
    );
    unmount();

    pathname = '/agent/actions';
    render(<SidebarNav />);
    expect(
      within(screen.getByRole('navigation', { name: 'Mode' })).getByRole('link', {
        name: 'Agent',
      }),
    ).toHaveAttribute('aria-current', 'page');
    // Agent mode replaces the Dashboard stations.
    expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();
  });

  it('returns each mode to the last route it used for the project', () => {
    pathname = '/agent/skills';
    const { unmount } = render(<SidebarNav />);
    unmount();

    pathname = '/demand';
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      '/agent/skills?project=11111111-1111-4111-8111-111111111111',
    );
  });

  it('omits section heading for Overview but renders headings for other stations', () => {
    render(<SidebarNav />);
    expect(screen.queryByText('Overview', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByText('Analyze', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Track', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Connect', { selector: 'p' })).not.toBeInTheDocument();
  });

  // Intent warms the key, but no longer in the same tick: each prefetcher
  // imports its API module on demand, so that the ten domains this map reaches
  // stay out of the chunk the browser needs before it can paint anything.
  it('prefetches the destination primary query on pointer and keyboard intent', async () => {
    render(<SidebarNav />);
    const performance = screen.getByRole('link', { name: 'Performance' });
    fireEvent.mouseEnter(performance);
    await waitFor(() => expect(mocks.prefetchQuery).toHaveBeenCalled());
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(PERFORMANCE_LANDING_KEY);

    mocks.prefetchQuery.mockClear();
    mocks.find.mockClear();
    fireEvent.focus(performance);
    await waitFor(() => expect(mocks.prefetchQuery).toHaveBeenCalledOnce());
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(PERFORMANCE_LANDING_KEY);
  });

  /**
   * The same contract for AI Visibility: intent must warm the key the screen
   * itself reads. A key spelled out in the prefetcher drifted from the
   * selection the dashboard builds and warmed an entry nothing consumed.
   */
  it('warms the Visibility landing selection the screen actually reads', async () => {
    render(<SidebarNav />);
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'AI Visibility' }));
    await waitFor(() => expect(mocks.prefetchQuery).toHaveBeenCalled());
    const keys = mocks.prefetchQuery.mock.calls.map((call) => call[0].queryKey);
    expect(keys).toContainEqual([
      'visibility',
      'project',
      '11111111-1111-4111-8111-111111111111',
      'latest',
      { cohort: 'core', selection_mode: 'latest' },
    ]);
  });
});
