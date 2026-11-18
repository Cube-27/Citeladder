import { createElement } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { act, renderHook } from '@testing-library/react';

import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

import {
  useCanonicalSourcesTab,
  useVisibilityFilters,
  visibilityEvidenceHref,
} from './use-visibility-dashboard';

describe('visibilityEvidenceHref', () => {
  it('keeps the shared selection, drops the Brand page and evidence keys, and applies the slice', () => {
    const href = visibilityEvidenceHref(
      '?market=m-1&cohort=all&run=old&brand=Globex&metric=sov&cursor=c1&prompt=p1',
      { run: 'r-2', engine: 'gemini', competitor: null },
    );
    expect(Object.fromEntries(new URL(href, 'https://x.test').searchParams)).toEqual({
      market: 'm-1',
      cohort: 'all',
      run: 'r-2',
      tab: 'query-fanout',
      engine: 'gemini',
    });
    expect(href.startsWith('/visibility?')).toBe(true);
  });
});

describe('useVisibilityFilters', () => {
  it('pools a period in one write that drops the run read before', () => {
    window.history.replaceState(null, '', '/brand?project=p-1&run=r-1&cursor=c1&engine=gemini');
    let filters: ReturnType<typeof useVisibilityFilters> | undefined;
    function Probe() {
      filters = useVisibilityFilters();
      return null;
    }
    const project = makeProject();
    renderWithProviders(createElement(Probe), {
      projectSelection: { activeProject: project, activeProjectId: project.id, status: 'ready' },
    });
    act(() => filters?.selectPeriod('all'));
    expect(window.location.search).toBe('?project=p-1&engine=gemini&selection=range&range=all');
  });
});

describe('useCanonicalSourcesTab', () => {
  it('replaces a removed tab with the default and keeps a known one', () => {
    const push = vi.spyOn(window.history, 'pushState');
    window.history.replaceState(null, '', '/visibility?project=p-1&tab=trends&run=r-1');
    const { unmount } = renderHook(() => useCanonicalSourcesTab());
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      '/visibility?project=p-1&run=r-1',
    );
    unmount();

    window.history.replaceState(null, '', '/visibility?project=p-1&tab=ads');
    renderHook(() => useCanonicalSourcesTab());
    expect(window.location.search).toBe('?project=p-1&tab=ads');
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});
