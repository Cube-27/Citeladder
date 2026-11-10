import { render, screen } from '@testing-library/react';
import { FileText, ListChecks } from 'lucide-react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { NavLink } from './nav-link';

const count = vi.hoisted(() => ({ broken: false }));

// The real count, unless a test breaks it to see the row survive.
vi.mock('./open-action-count', async (importActual) => {
  const actual = await importActual<typeof import('./open-action-count')>();
  return {
    OpenActionCount: (props: Parameters<typeof actual.OpenActionCount>[0]) => {
      if (count.broken) throw new TypeError("Cannot read properties of undefined (reading 'open')");
      return actual.OpenActionCount(props);
    },
  };
});

const PROJECT = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  count.broken = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Navigation row', () => {
  const sink = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  beforeEach(() => {
    sink.mockClear();
  });

  it('keeps the row when its count throws while rendering, and reports the defect', async () => {
    count.broken = true;
    vi.stubGlobal('fetch', sink);
    // React reports the caught error; the assertions are on what renders and is sent.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <nav aria-label="Main">
          <NavLink
            item={{
              label: 'Actions',
              href: '/agent/actions',
              icon: ListChecks,
              badge: 'actions',
              scope: 'project',
            }}
            active={false}
            onIntent={() => {}}
          />
        </nav>
      </MemoryRouter>,
    );

    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('link', { name: 'Actions' })).toHaveAttribute('href', '/agent/actions');
    const [url, init] = sink.mock.calls[0]!;
    expect(url).toBe('/api/v1/client-errors');
    expect(JSON.parse(String(init.body))).toMatchObject({
      kind: 'render',
      message: "Cannot read properties of undefined (reading 'open')",
      component: 'open-action-count',
    });
  });

  it("counts each screen's own open work beside Actions and Content optimization from one read", async () => {
    mswServer.listen({ onUnhandledFrame: 'error' });
    const surfaces: (string | null)[] = [];
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/actions`, ({ request }) => {
        surfaces.push(new URL(request.url).searchParams.get('surface'));
        return HttpResponse.json({
          items: [],
          next_cursor: null,
          status_counts: { open: 6, in_progress: 3 },
          surface_open_counts: { actions: 7, content: 2 },
          content_gap_source: null,
        });
      }),
    );
    try {
      renderWithProviders(
        <nav aria-label="Main">
          <NavLink
            item={{
              label: 'Actions',
              href: '/agent/actions',
              icon: ListChecks,
              badge: 'actions',
              scope: 'project',
            }}
            active={false}
            onIntent={() => {}}
          />
          <NavLink
            item={{
              label: 'Content',
              href: '/agent/content',
              icon: FileText,
              badge: 'content',
              scope: 'project',
            }}
            active={false}
            onIntent={() => {}}
          />
        </nav>,
        {
          projectSelection: {
            activeProjectId: PROJECT,
            activeProject: makeProject({ id: PROJECT }),
            status: 'ready',
          },
        },
      );

      expect(await screen.findByRole('link', { name: 'Actions, 7 open' })).toBeVisible();
      expect(await screen.findByRole('link', { name: 'Content, 2 open' })).toBeVisible();
      // Both badges share the shell's one unfiltered read.
      expect(surfaces).toEqual([null]);
    } finally {
      mswServer.resetHandlers();
      mswServer.close();
    }
  });
});
