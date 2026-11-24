import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { reloadOnceForChunkLoad, reportClientError, setReportingWorkspace } from './client-errors';

const sink = vi.fn((_url: string, _init: RequestInit) =>
  Promise.resolve(new Response(null, { status: 204 })),
);

function sent() {
  return sink.mock.calls.map(([, init]) => ({
    workspace: new Headers(init.headers).get('X-Workspace-Id'),
    release: (JSON.parse(String(init.body)) as { release: string }).release,
    priority: init.priority,
  }));
}

beforeEach(() => vi.stubGlobal('fetch', sink));
afterEach(() => {
  vi.unstubAllGlobals();
  document.head.querySelector('meta[name="citeladder-release"]')?.remove();
  setReportingWorkspace(null);
});

describe('Client error reports', () => {
  it('scope to the active workspace and name the release index.html carries, at report time', () => {
    reportClientError({ kind: 'unhandled', error: new Error('before any selection') });
    const meta = document.createElement('meta');
    meta.name = 'citeladder-release';
    meta.content = '3f9a1c2';
    document.head.append(meta);
    setReportingWorkspace('6f1d3a52-0000-4000-8000-000000000001');
    reportClientError({ kind: 'unhandled', error: new Error('after selection') });

    expect(sent()).toEqual([
      { workspace: null, release: 'development', priority: 'low' },
      { workspace: '6f1d3a52-0000-4000-8000-000000000001', release: '3f9a1c2', priority: 'low' },
    ]);
  });

  it('reload once for a chunk that failed to load, and never for the same chunk again or another error', () => {
    const reload = vi.fn();
    const chunk = new Error(
      'Failed to fetch dynamically imported module: https://app.test/app-assets/targets-a1.js',
    );

    expect(reloadOnceForChunkLoad(new Error('Cannot read properties of null'), reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(0);
    expect(reloadOnceForChunkLoad(chunk, reload)).toBe(true);
    expect(reloadOnceForChunkLoad(chunk, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
