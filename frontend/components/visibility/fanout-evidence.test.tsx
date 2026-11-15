import { useQuery } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { VisibilityEvidenceResponse } from '@citeladder/contracts';
import { ApiError } from '@/lib/api/errors';
import { visibilityApi } from '@/lib/api/visibility';
import { ActiveProjectScopeProvider } from '@/lib/project/active-project-scope';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';
import { FanoutEvidence } from './fanout-evidence';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const evidence: VisibilityEvidenceResponse = {
  truncated: false,
  items: [
    {
      audit_id: A,
      task_id: A,
      analysis_id: A,
      artifact_id: null,
      prompt_snapshot_id: A,
      prompt_id: null,
      prompt_index: 0,
      prompt_text: 'Best CRM?',
      repetition: 1,
      completed_at: '2026-01-15T00:00:00Z',
      logical_engine: 'chatgpt',
      transport_provider: 'openai',
      transport_model: 'gpt-4',
      retrieval_enabled: true,
      search_used: true,
      search_query_count: 1,
      query_text_available: true,
      state: 'queries_available',
      event_source: 'raw_artifact',
      mentions: [],
      citations: [],
      search_events: [
        { sequence: 0, query: 'best crm', call_id: '', call_sequence: 0, query_sequence: 0 },
      ],
    },
  ],
};

function Panel({ projectId }: Readonly<{ projectId: string }>) {
  const query = useQuery({
    queryKey: ['test-evidence', projectId],
    queryFn: async () => evidence,
    initialData: evidence,
  });
  const project = useMemo(() => makeProject({ id: projectId }), [projectId]);
  // The project route's gate hands the panel its project; a switch is a new one.
  return (
    <ActiveProjectScopeProvider project={project}>
      <FanoutEvidence
        query={query}
        runId={null}
        scope={{}}
        scopeReady
        scopeNarrowed={false}
        isFiltered={false}
        limit={100}
      />
    </ActiveProjectScopeProvider>
  );
}

function EmptyPanel({ onClearFilters }: Readonly<{ onClearFilters?: () => void }>) {
  const empty: VisibilityEvidenceResponse = { truncated: false, items: [] };
  const query = useQuery({
    queryKey: ['test-evidence-empty'],
    queryFn: async () => empty,
    initialData: empty,
  });
  const project = useMemo(() => makeProject({ id: A }), []);
  return (
    <ActiveProjectScopeProvider project={project}>
      <FanoutEvidence
        query={query}
        runId={null}
        scope={{}}
        scopeReady
        scopeNarrowed={false}
        isFiltered={onClearFilters !== undefined}
        onClearFilters={onClearFilters}
        limit={100}
      />
    </ActiveProjectScopeProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('Fanout empty states', () => {
  // No searches yet sends the reader to run something; filters that hide
  // every search offer to clear them instead, since the data may exist.
  it('tells an empty read from one the filters emptied', async () => {
    vi.spyOn(visibilityApi, 'getFanoutSummary').mockReturnValue(new Promise(() => {}));
    const onClear = vi.fn();
    const view = renderWithProviders(<EmptyPanel />);
    expect(screen.getByText('No searches recorded yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View Runs' })).toHaveAttribute('href', '/runs');
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();

    view.rerender(<EmptyPanel onClearFilters={onClear} />);
    expect(screen.queryByRole('link', { name: 'View Runs' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('Fanout evidence scope', () => {
  it('drops another project’s totals during a switch and after the new summary fails', async () => {
    let rejectNext!: (error: unknown) => void;
    vi.spyOn(visibilityApi, 'getFanoutSummary').mockImplementation((projectId) =>
      projectId === A
        ? Promise.resolve({
            event_count: 50,
            distinct_queries: 20,
            matched_queries: 20,
            coverage: {},
            next_cursor: null,
            total_answers: 50,
            answers: [],
            items: [],
          })
        : new Promise((_, reject) => {
            rejectNext = reject;
          }),
    );
    const view = renderWithProviders(<Panel projectId={A} />);
    expect(
      await screen.findByLabelText(
        '20 distinct searches and 50 total occurrences across the selected run set',
      ),
    ).toBeInTheDocument();
    view.rerender(<Panel projectId={B} />);
    expect(screen.queryByLabelText(/20 distinct searches/)).not.toBeInTheDocument();
    await act(async () => rejectNext(new ApiError('Access denied', 403, '')));
    expect(
      await screen.findByLabelText(
        '1 distinct searches and 1 total occurrences in the searches shown below',
      ),
    ).toBeInTheDocument();
  });
});

describe('Fanout grouping', () => {
  it('groups the table by prompt from its own filters, naming each surface', async () => {
    vi.spyOn(visibilityApi, 'getFanoutSummary').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<Panel projectId={A} />);
    expect(screen.getByRole('columnheader', { name: 'Surface' })).toBeVisible();
    expect(screen.queryByText('Best CRM?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Group by: None' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Prompt' }));
    expect(await screen.findByText('Best CRM?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Group by: Prompt' })).toBeVisible();
  });
});
