import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const replace = vi.fn();
let pathname = '/projects';
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
  useSearchParams: () => search,
}));

const setActiveProjectId = vi.fn();
let activeProjectId: string | null = null;
vi.mock('@/lib/project/project-context', () => ({
  useProjectContext: () => ({ activeProjectId, setActiveProjectId }),
}));

import { projectDestination, useSelectProject, workspaceDestination } from './project-destination';

const PROJECT_1 = '11111111-1111-4111-8111-111111111111';
const PROJECT_2 = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  setActiveProjectId.mockClear();
  pathname = '/projects';
  search = new URLSearchParams();
  activeProjectId = null;
});

describe('projectDestination', () => {
  it('keeps the destination parameters and drops the workspace', () => {
    // A verified project id already names its workspace; keeping both invites
    // the contradictory pair the provider has to reject.
    const href = projectDestination(
      '/visibility',
      new URLSearchParams({ tab: 'sources', workspace: WORKSPACE }),
      PROJECT_1,
    );
    expect(href).toBe(`/visibility?tab=sources&project=${PROJECT_1}`);
  });
});

describe('workspaceDestination', () => {
  it('names the workspace on a route that has no project to identify itself', () => {
    expect(workspaceDestination('/onboarding', new URLSearchParams({ new: '1' }), WORKSPACE)).toBe(
      `/onboarding?new=1&workspace=${WORKSPACE}`,
    );
  });
});

describe('useSelectProject', () => {
  it('pushes one entry for a deliberate switch, so Back returns to the previous project', () => {
    activeProjectId = PROJECT_1;
    search = new URLSearchParams({ project: PROJECT_1 });
    const { result } = renderHook(() => useSelectProject());

    act(() => result.current(PROJECT_2));

    expect(setActiveProjectId).toHaveBeenCalledWith(PROJECT_2);
    expect(push).toHaveBeenCalledWith(`/projects?project=${PROJECT_2}`);
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces when it is only filling in an absent parameter', () => {
    // Bookkeeping, not navigation: pushing here would make Back land on the
    // same page minus a query string and look like it did nothing.
    activeProjectId = PROJECT_1;
    const { result } = renderHook(() => useSelectProject());

    act(() => result.current(PROJECT_1));

    expect(replace).toHaveBeenCalledWith(`/projects?project=${PROJECT_1}`, { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('adds no history entry for the project already in the URL', () => {
    activeProjectId = PROJECT_1;
    search = new URLSearchParams({ project: PROJECT_1 });
    const { result } = renderHook(() => useSelectProject());

    act(() => result.current(PROJECT_1));

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces when the entry being left behind is dead', () => {
    // After deleting the active project, Back must not return to a URL naming
    // a project that no longer exists.
    activeProjectId = PROJECT_1;
    search = new URLSearchParams({ project: PROJECT_1 });
    const { result } = renderHook(() => useSelectProject());

    act(() => result.current(PROJECT_2, { replace: true }));

    expect(replace).toHaveBeenCalledWith(`/projects?project=${PROJECT_2}`, { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes when the selection also changes page', () => {
    activeProjectId = PROJECT_1;
    const { result } = renderHook(() => useSelectProject());

    act(() => result.current(PROJECT_1, { destination: '/settings' }));

    expect(push).toHaveBeenCalledWith(`/settings?project=${PROJECT_1}`);
  });
});
