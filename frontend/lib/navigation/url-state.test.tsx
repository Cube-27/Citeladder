import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router-dom';

import {
  optionalStringUrlCodec,
  setUrlParams,
  setUrlStateRouter,
  stringUrlCodec,
} from './url-state';

beforeEach(() => window.history.replaceState(null, '', '/projects'));
afterEach(() => setUrlStateRouter(null));

describe('URL state codecs', () => {
  it('canonicalizes invalid enums to the default and omits that default', () => {
    const codec = stringUrlCodec(['overview', 'issues'] as const, 'overview');
    expect(codec.parse('issues')).toBe('issues');
    expect(codec.parse('unknown')).toBe('overview');
    expect(codec.serialize('overview')).toBeNull();
    expect(codec.serialize('issues')).toBe('issues');
  });

  it('round-trips optional selected IDs', () => {
    expect(optionalStringUrlCodec.parse('issue-id')).toBe('issue-id');
    expect(optionalStringUrlCodec.serialize(null)).toBeNull();
  });

  it('preserves unrelated scope and hash while avoiding duplicate history entries', () => {
    window.history.replaceState(null, '', '/opportunities?project=project-id&keep=1#evidence');
    const push = vi.spyOn(window.history, 'pushState');

    setUrlParams({ selected: 'opportunity-id' });
    expect(window.location.href).toContain(
      '/opportunities?project=project-id&keep=1&selected=opportunity-id#evidence',
    );
    expect(push).toHaveBeenCalledOnce();

    setUrlParams({ selected: 'opportunity-id' });
    expect(push).toHaveBeenCalledOnce();
    push.mockRestore();
  });

  it('does not add history for an equivalent query encoding', () => {
    window.history.replaceState(null, '', '/opportunities?query=one%20two');
    const push = vi.spyOn(window.history, 'pushState');

    setUrlParams({ query: 'one two' });

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });
});

/**
 * URL-owned filter state and React Router must not each believe they own the
 * address.
 *
 * Writing it with `history.pushState` directly is invisible to the router — it
 * only watches `popstate` — so every consumer of `useSearchParams` kept the
 * previous query after a filter change. The damaging one is the shell's
 * canonical-URL rewrite: it rebuilds the address from what it can see, so the
 * next navigation silently dropped the filters the reader had just set.
 */
describe('router registration', () => {
  function Probe() {
    const [params] = useSearchParams();
    return <output data-testid="search">{params.toString()}</output>;
  }

  it('makes a filter write visible to useSearchParams in the same tree', async () => {
    // `setUrlParams` composes the next address from `window.location`, which in
    // the app IS the router's location. A memory router has its own, so they
    // are lined up here rather than left to disagree.
    window.history.replaceState(null, '', '/issues?project=p1');
    const router = createMemoryRouter([{ path: '/issues', element: <Probe /> }], {
      initialEntries: ['/issues?project=p1'],
    });
    setUrlStateRouter(router);
    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('search')).toHaveTextContent('project=p1');

    setUrlParams({ severity: 'medium' });

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('severity=medium'));
    // The scope the shell owns survives the filter write, rather than being
    // rebuilt later from a stale read.
    expect(screen.getByTestId('search')).toHaveTextContent('project=p1');
  });

  it('falls back to history when nothing has registered a router', () => {
    window.history.replaceState(null, '', '/issues?project=p1');
    const push = vi.spyOn(window.history, 'pushState');
    setUrlParams({ severity: 'low' });
    expect(push).toHaveBeenCalledOnce();
    expect(window.location.search).toContain('severity=low');
    push.mockRestore();
  });
});
