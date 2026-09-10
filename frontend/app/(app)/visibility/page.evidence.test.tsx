import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ANALYSIS_B,
  ANALYSIS_C,
  AUDIT_LATEST,
  PROJECT_ID,
  makeEvidenceItem,
  makeEvidenceResponse,
  makeVisibility,
  renderVisibilityPage,
  setupVisibilityPageTests,
  useBaseVisibilityHandlers,
} from '@/test/fixtures/visibility';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/visibility',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

setupVisibilityPageTests(() => {
  window.history.replaceState(null, '', '/visibility');
});

function setVisibilitySearch(search: string) {
  window.history.replaceState(null, '', `/visibility?${search}`);
}

describe('VisibilityPage — Mentions & Citations tab', () => {
  it('renders persisted mentions, classified citations, and provenance', async () => {
    setVisibilitySearch('tab=mentions-citations&mode=answers');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json(makeEvidenceResponse()),
      ),
    ]);
    renderVisibilityPage();

    expect(
      await screen.findByText(
        'Best affordable clothing stores in Australia?',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    // Mentions render as classification badges.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    // Classified citation is shown.
    expect(screen.getByText('Acme Blog')).toBeInTheDocument();
    // No generated-query list on this tab.
    expect(screen.queryByText('affordable family clothing Australia 2026')).toBeNull();
  });

  it('sends the audit/prompt/engine params and shows the truncation notice', async () => {
    setVisibilitySearch('tab=mentions-citations&mode=answers');
    let captured: URL | null = null;
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, ({ request }) => {
        captured = new URL(request.url);
        return HttpResponse.json(makeEvidenceResponse({ truncated: true }));
      }),
    ]);
    renderVisibilityPage();

    await screen.findByText('Best affordable clothing stores in Australia?');
    // Evidence is scoped to the run the projection RESOLVED, not left for the
    // server to resolve again: a run completing between the two requests would
    // otherwise leave the headline figures and the evidence describing
    // different runs, which is exactly what has to reconcile.
    expect(captured!.searchParams.get('audit_id')).toBe(AUDIT_LATEST);
    expect(captured!.searchParams.get('limit')).toBe('100');
    // The cap-and-notify behaviour became real pagination, so the reader can
    // reach past the first page rather than being told results were cut off.
    expect(screen.getByRole('button', { name: 'Next answers' })).toBeInTheDocument();
  });

  it('renders the empty state when there is no persisted evidence and no narrowing filter', async () => {
    setVisibilitySearch('tab=mentions-citations&mode=answers');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json({ items: [], truncated: false }),
      ),
    ]);
    const user = userEvent.setup();
    renderVisibilityPage();

    // The default range preset (90d) counts as a narrowing filter; widen it so
    // the genuinely-empty (not filtered-empty) state is exercised.
    await user.click(await screen.findByRole('button', { name: 'Select date range' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'All time' }));

    expect(await screen.findByText('No mentions or citations yet')).toBeInTheDocument();
  });

  it('renders the filtered-empty state with a clear-filters action', async () => {
    // Evidence is scoped by RUN, not by the trend range, so an empty result is
    // only filtered-empty once a filter that actually narrows it is set —
    // otherwise it means the run produced nothing, which is a different thing
    // and gets a different state.
    setVisibilitySearch('tab=mentions-citations&mode=answers&outcome=brand_absent');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json({ items: [], truncated: false }),
      ),
    ]);
    renderVisibilityPage();

    expect(await screen.findByText('No results match these filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('renders the retryable error state', async () => {
    setVisibilitySearch('tab=mentions-citations&mode=answers');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 400 }),
      ),
    ]);
    renderVisibilityPage();

    expect(await screen.findByText(/Couldn't load this evidence/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('VisibilityPage — Query fanouts tab', () => {
  it('renders actual query text, count-only, and no-search states distinctly', async () => {
    setVisibilitySearch('tab=query-fanout');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json({
          items: [
            makeEvidenceItem(),
            makeEvidenceItem({
              analysis_id: ANALYSIS_B,
              logical_engine: 'claude',
              transport_model: 'claude-sonnet-4-6',
              state: 'count_only',
              query_text_available: false,
              search_query_count: 1,
              search_events: [],
              event_source: 'audit_task',
              artifact_id: null,
              mentions: [],
              citations: [],
            }),
            makeEvidenceItem({
              analysis_id: ANALYSIS_C,
              prompt_index: 2,
              logical_engine: 'gemini',
              transport_model: 'gemini-flash-latest',
              state: 'no_search',
              search_used: false,
              search_query_count: 0,
              query_text_available: false,
              search_events: [],
              event_source: 'none',
              mentions: [],
              citations: [],
            }),
          ],
          truncated: false,
        }),
      ),
    ]);
    renderVisibilityPage();

    // A query whose wording the model exposed becomes a row of the table.
    expect(
      await screen.findByText('affordable family clothing Australia 2026'),
    ).toBeInTheDocument();
    // The other two states are real facts about the run, so they are counted
    // rather than invented as rows: one search whose wording was withheld, and
    // one answer that searched nothing at all.
    expect(
      screen.getByText(/1 answer searched without returning the wording/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 answered without searching/)).toBeInTheDocument();
    // No duplicated citation browser here.
    expect(screen.queryByText('Acme Blog')).toBeNull();
  });

  it('groups searches under the frozen prompt when asked to', async () => {
    setVisibilitySearch('tab=query-fanout&group=prompt');
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, () =>
        HttpResponse.json(makeEvidenceResponse()),
      ),
    ]);
    renderVisibilityPage();

    // The prompt names its group as a spanning row of the shared table, so
    // every search in the tab keeps one set of columns.
    expect(
      await screen.findByText('Best affordable clothing stores in Australia?'),
    ).toBeInTheDocument();
    // Totals count what the loaded window observed, never a project-wide claim.
    expect(screen.getByText('Distinct searches')).toBeInTheDocument();
  });
});

describe('VisibilityPage — shared filter persistence', () => {
  it('keeps the selected engine when switching tabs', async () => {
    const evidenceEngines: (string | null)[] = [];
    useBaseVisibilityHandlers([
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility`, () =>
        HttpResponse.json(makeVisibility(AUDIT_LATEST, 67)),
      ),
      http.get(`/api/v1/projects/${PROJECT_ID}/visibility/evidence`, ({ request }) => {
        evidenceEngines.push(new URL(request.url).searchParams.get('engine'));
        return HttpResponse.json(makeEvidenceResponse());
      }),
    ]);
    const user = userEvent.setup();
    renderVisibilityPage();

    await screen.findByRole('heading', { name: 'By model' });
    // Pick an engine on Trends.
    await user.click(screen.getByRole('button', { name: 'Filter by model' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Gemini' }));

    // Switch to an evidence tab; the engine filter carries over into the query.
    await user.click(screen.getByRole('tab', { name: 'Mentions & Citations' }));
    await screen.findByRole('button', { name: /^Show$/i });
    await waitFor(() => expect(evidenceEngines).toContain('gemini'));
  });
});
