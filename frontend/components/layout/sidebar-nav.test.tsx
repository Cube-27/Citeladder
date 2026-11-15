import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn((_options: { queryKey: readonly unknown[] }) => Promise.resolve()),
  // `prefetchRoute` skips keys whose query already failed, so the stub client
  // needs the cache lookup that guard performs. Nothing has failed here.
  find: vi.fn((_filters: { queryKey: readonly unknown[] }) => undefined),
  // The Actions list read behind the open count.
  actionsList: { status_counts: { open: 3, in_progress: 2, completed: 9 } },
  chats: [
    {
      id: '33333333-3333-4333-8333-333333333331',
      title: 'Why did citations drop',
      origin: 'chat',
      last_activity_at: '2026-11-12T10:00:00Z',
      running: true,
    },
  ],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.actionsList, isLoading: false }),
  // The Agent list's chats.
  useInfiniteQuery: () => ({
    data: { pages: [{ items: mocks.chats }] },
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
  }),
  infiniteQueryOptions: <T,>(options: T) => options,
  useQueryClient: () => ({
    prefetchQuery: mocks.prefetchQuery,
    getQueryCache: () => ({ find: mocks.find }),
  }),
  // Query-options factories are typed identity at runtime; the route
  // prefetchers call them to build the key asserted below.
  queryOptions: <T,>(options: T) => options,
}));

vi.mock('@/lib/project/project-context', () => {
  const context = {
    activeProject: {
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
    activeProjectId: '11111111-1111-4111-8111-111111111111',
    activeWorkspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  return {
    useActiveWorkspaceId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    useProjectContext: () => context,
    useOptionalProjectContext: () => context,
  };
});

let pathname = '/site';
let searchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
    createElement('a', { ...props, href: to }, children),
  useLocation: () => ({ pathname, search: '' }),
  useSearchParams: () => [searchParams, vi.fn()],
}));

import { performanceQueries } from '@/lib/api/performance';
import { INITIAL_VISIBILITY_PARAMS } from '@/lib/api/visibility';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { INITIAL_DASHBOARD_PARAMS } from '@/lib/performance/performance';
import { navigationMode } from '@/lib/navigation/app-routes';
import { AgentNav } from '@/components/agent/agent-nav';
import { ModeSwitch, useModeMemory } from './mode-switch';
import { DashboardNav, SidebarFootNav, useDestinationMemory } from './sidebar-nav';

/** The labelled sidebar as the shell draws it: the switch, the mode's list, the foot. */
function SidebarNav() {
  useDestinationMemory();
  useModeMemory();
  return (
    <div data-sidebar-state="expanded">
      <ModeSwitch />
      {navigationMode(pathname) === 'agent' ? <AgentNav /> : <DashboardNav />}
      <SidebarFootNav rail={false} />
    </div>
  );
}

const SCOPE = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  projectId: '11111111-1111-4111-8111-111111111111',
};
// The key the Performance screen's own landing selection reads, so a hover
// warms exactly the entry the destination consumes.
const PERFORMANCE_LANDING_KEY = performanceQueries.dashboard(
  SCOPE,
  INITIAL_DASHBOARD_PARAMS,
).queryKey;

describe('station navigation', () => {
  beforeEach(() => {
    pathname = '/site';
    searchParams = new URLSearchParams();
    window.sessionStorage.clear();
    mocks.prefetchQuery.mockClear();
    mocks.find.mockClear();
  });

  it('scopes project destinations to the project and setup to the workspace', () => {
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      '/site?project=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '/settings?tab=integrations&workspace=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('shows open and in-progress Actions as the Actions count', async () => {
    render(<SidebarNav />);
    // The count's code loads after the shell, so it arrives a moment later.
    // It says what it counts: open Actions, not issues.
    expect(
      await screen.findByRole('link', { name: 'Actions, 5 open Actions' }, { timeout: 4_500 }),
    ).toHaveAttribute('href', '/agent/actions?project=11111111-1111-4111-8111-111111111111');
  });

  it('keeps a screen current on every one of its tabs', () => {
    pathname = '/site';
    searchParams = new URLSearchParams('tab=internal-links');
    const { unmount } = render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('aria-current', 'page');
    unmount();

    // A destination that names a tab is current only on that tab.
    pathname = '/settings';
    searchParams = new URLSearchParams('tab=members');
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Integrations' })).not.toHaveAttribute('aria-current');
  });

  it('marks Shopping current, not also Products below it', () => {
    pathname = '/products/overview';
    const { unmount } = render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Shopping' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
    unmount();

    // A product's own page is still under Products.
    pathname = '/products/22222222-2222-4222-8222-222222222222';
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Shopping' })).not.toHaveAttribute('aria-current');
  });

  it('lists the mode of the route: Actions in both, the analysis pages in Dashboard only', () => {
    pathname = '/agent/actions';
    const { unmount } = render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /^Actions/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'New chat' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search chats' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Why did citations drop/ })).toHaveAttribute(
      'href',
      '/agent/chats/33333333-3333-4333-8333-333333333331?project=11111111-1111-4111-8111-111111111111',
    );
    expect(screen.queryByRole('link', { name: 'Website' })).toBeNull();
    unmount();

    pathname = '/site';
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByRole('link', { name: /^Actions/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Skills' })).toBeNull();
  });

  it('returns each destination and each mode to the last screen used in it', () => {
    const chat = '/agent/chats/33333333-3333-4333-8333-333333333331';
    const action = '/agent/actions/44444444-4444-4444-8444-444444444441';
    pathname = action;
    const first = render(<SidebarNav />);
    first.unmount();
    pathname = chat;
    const second = render(<SidebarNav />);
    // On a chat, New chat opens a new chat.
    expect(screen.getByRole('link', { name: 'New chat' })).toHaveAttribute(
      'href',
      '/agent?project=11111111-1111-4111-8111-111111111111',
    );
    second.unmount();

    pathname = '/demand';
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Agent' })).toHaveAttribute(
      'href',
      `${chat}?project=11111111-1111-4111-8111-111111111111`,
    );
    expect(screen.getByRole('link', { name: /^Actions/ })).toHaveAttribute(
      'href',
      `${action}?project=11111111-1111-4111-8111-111111111111`,
    );
    // A destination never used keeps its front door.
    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute(
      'href',
      '/runs?project=11111111-1111-4111-8111-111111111111',
    );
  });

  it('folds a group to the current page alone, and keeps the fold', () => {
    pathname = '/site';
    const { unmount } = render(<SidebarNav />);
    const analyze = screen.getByRole('button', { name: 'Analyze' });
    expect(analyze).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(analyze);
    expect(analyze).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Issues' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute('aria-current', 'page');
    unmount();

    // Reloaded on another page, the group stays folded and shows nothing it holds.
    pathname = '/runs';
    render(<SidebarNav />);
    expect(screen.getByRole('button', { name: 'Analyze' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('link', { name: 'Website' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Runs' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    expect(screen.getByRole('link', { name: 'Issues' })).toBeInTheDocument();
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
    expect(keys).toContainEqual(
      visibilityQueries.project(SCOPE, INITIAL_VISIBILITY_PARAMS).queryKey,
    );
  });
});
