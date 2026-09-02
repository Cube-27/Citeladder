import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn((_options: { queryKey: readonly unknown[] }) => Promise.resolve()),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ prefetchQuery: mocks.prefetchQuery }),
}));

vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProject: { id: '11111111-1111-4111-8111-111111111111' } }),
}));

let pathname = '/site';
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

import { MobilePrimaryNavigation, MobileStationNavigation, SidebarNav } from './sidebar-nav';
import { NAV_GROUPS } from './nav-items';

describe('station navigation', () => {
  beforeEach(() => {
    mocks.prefetchQuery.mockClear();
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

  it('uses query-aware active state for station destinations', () => {
    pathname = '/site';
    searchParams = new URLSearchParams('tab=pages');
    render(<SidebarNav />);
    const activeLink = screen.getByRole('link', { name: 'Website' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink).toHaveClass('bg-panel');
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveClass('hover:bg-panel/70');
  });

  it('renders exact mobile stations and shared secondary destinations', () => {
    pathname = '/visibility';
    searchParams = new URLSearchParams('tab=trends');
    render(
      <>
        <MobilePrimaryNavigation />
        <MobileStationNavigation />
      </>,
    );
    const primary = screen.getByRole('navigation', { name: 'Primary mobile navigation' });
    expect(primary).toHaveTextContent('OverviewAnalyzeActTrack');
    expect(screen.getByRole('link', { name: 'Track' })).toHaveAttribute('aria-current', 'page');
    const secondary = screen.getByRole('navigation', { name: 'Track destinations' });
    expect(secondary).toHaveTextContent('PromptsAI VisibilityRunsAI Referrals');
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
    const traffic = screen.getByRole('link', { name: 'Traffic' });
    fireEvent.mouseEnter(traffic);
    expect(mocks.prefetchQuery).toHaveBeenCalled();
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual([
      'traffic',
      'dashboard',
      '11111111-1111-4111-8111-111111111111',
      { granularity: 'day' },
    ]);

    mocks.prefetchQuery.mockClear();
    fireEvent.focus(traffic);
    expect(mocks.prefetchQuery).toHaveBeenCalledOnce();
    expect(mocks.prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual([
      'traffic',
      'dashboard',
      '11111111-1111-4111-8111-111111111111',
      { granularity: 'day' },
    ]);
  });
});
