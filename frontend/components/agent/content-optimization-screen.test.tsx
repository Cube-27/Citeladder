import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { makeProject } from '@/test/fixtures/project';
import { renderWithProviders } from '@/test/render';

import { ActionDetailScreen } from './action-detail-screen';
import { ContentOptimizationScreen } from './content-optimization-screen';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const PAGE_ACTION = '22222222-2222-4222-8222-222222222222';
const PLANNED_ACTION = '33333333-3333-4333-8333-333333333333';
const IMPROVE = '44444444-4444-4444-8444-444444444444';
const CREATE = '55555555-5555-4555-8555-555555555555';
const PROMPT = '66666666-6666-4666-8666-666666666666';
const NOW = '2026-11-10T10:00:00Z';

const selection = {
  activeProjectId: PROJECT,
  activeProject: makeProject({ id: PROJECT }),
  status: 'ready' as const,
};

const base = {
  project_id: PROJECT,
  surface: 'content',
  target_prompt_id: null,
  origin: 'evidence',
  status: 'open',
  priority_score: 40,
  families: ['content_optimization'],
  skill_id: 'content_create',
  member_count: 1,
  evidence_cleared_at: null,
  created_at: NOW,
  updated_at: NOW,
};

const pageAction = {
  ...base,
  id: PAGE_ACTION,
  target_kind: 'page',
  target_label: 'https://acme.test/crm-pricing',
  target_url: 'https://acme.test/crm-pricing',
  approach: 'improve_existing',
  content_gaps: [
    {
      opportunity_id: IMPROVE,
      rule_id: 'content_gap_improve_page',
      angle_label: 'Pricing comparison',
      prompt_count: 3,
      citation_count: 9,
      domain_count: 4,
      competitor_count: 2,
    },
  ],
};

const plannedAction = {
  ...base,
  id: PLANNED_ACTION,
  target_kind: 'planned_page',
  // A topic worded apart from its angle's label, so each is found once.
  target_label: 'CRM onboarding checklist',
  target_url: null,
  approach: 'create_new',
  content_gaps: [
    {
      opportunity_id: CREATE,
      rule_id: 'content_gap_new_page',
      angle_label: 'Setup guide',
      prompt_count: 1,
      citation_count: 4,
      domain_count: 2,
      competitor_count: 1,
    },
  ],
};

function serveList(page: {
  items: unknown[];
  status_counts: Record<string, number>;
  content_gap_source: string | null;
}) {
  const searches: string[] = [];
  mswServer.use(
    http.get(`/api/v1/projects/${PROJECT}/actions`, ({ request }) => {
      searches.push(new URL(request.url).searchParams.get('surface') ?? 'none');
      return HttpResponse.json({
        next_cursor: null,
        surface_open_counts: { actions: 0, content: page.items.length },
        ...page,
      });
    }),
  );
  return searches;
}

/** A content page whose work is Site Health findings only: no content gap. */
const healthOnly = {
  ...base,
  id: '12121212-1212-4212-8212-121212121212',
  target_kind: 'page',
  target_label: 'https://acme.test/guide',
  target_url: 'https://acme.test/guide',
  approach: 'fix_technical',
  families: ['site_health'],
  content_gaps: [],
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Content optimization', () => {
  it('lists content Actions with their angle and counts from evidence', async () => {
    const searches = serveList({
      items: [pageAction, plannedAction],
      status_counts: { open: 2 },
      content_gap_source: 'current',
    });
    renderWithProviders(<ContentOptimizationScreen />, {
      initialEntries: ['/agent/content'],
      projectSelection: selection,
    });

    const page = await screen.findByRole('link', { name: 'https://acme.test/crm-pricing' });
    expect(page).toHaveAttribute('href', `/agent/content/${PAGE_ACTION}?project=${PROJECT}`);
    const pageRow = within(page.closest('tr')!);
    expect(pageRow.getByText('Pricing comparison')).toBeVisible();
    expect(pageRow.getByText('3')).toBeVisible();
    expect(pageRow.getByText('4 sites')).toBeVisible();
    expect(pageRow.getByText('2 competitors')).toBeVisible();
    expect(pageRow.getByText('Page · 1 finding in Content optimization')).toBeVisible();

    // A page to create is named by its own topic and summarized as planned.
    const planned = screen.getByRole('link', { name: 'CRM onboarding checklist' });
    expect(planned).toHaveAttribute('href', `/agent/content/${PLANNED_ACTION}?project=${PROJECT}`);
    const plannedRow = within(planned.closest('tr')!);
    expect(plannedRow.getByText('Planned page · 1 finding in Content optimization')).toBeVisible();
    expect(plannedRow.getByText('Setup guide')).toBeVisible();
    expect(plannedRow.getByText('1 competitor')).toBeVisible();
    // Current evidence: no notice above the rows.
    expect(screen.queryByText('Content gaps not computed yet')).toBeNull();
    // No score or priority anywhere on the list (CO14).
    expect(screen.queryByText('40')).not.toBeInTheDocument();
    expect(screen.queryByText('High')).not.toBeInTheDocument();
    // The table and the status counts share one request, for the content surface only.
    expect(searches).toEqual(['content']);
  });

  it("marks a row's counts as its lead angle's when it has more than one, and a gapless page as not applicable", async () => {
    serveList({
      items: [
        {
          ...pageAction,
          content_gaps: [
            ...pageAction.content_gaps,
            { ...pageAction.content_gaps[0]!, angle_label: 'Pricing tiers', prompt_count: 7 },
          ],
        },
        healthOnly,
      ],
      status_counts: { open: 2 },
      content_gap_source: 'current',
    });
    renderWithProviders(<ContentOptimizationScreen />, {
      initialEntries: ['/agent/content'],
      projectSelection: selection,
    });

    const page = await screen.findByRole('link', { name: 'https://acme.test/crm-pricing' });
    const row = within(page.closest('tr')!);
    expect(row.getByText('Lead angle · 1 more angle')).toBeVisible();
    expect(row.getByText('3')).toBeVisible();
    expect(row.queryByText('7')).toBeNull();
    const gapless = within(
      screen.getByRole('link', { name: 'https://acme.test/guide' }).closest('tr')!,
    );
    const marks = gapless.getAllByRole('button', { name: 'Not applicable' });
    expect(marks).toHaveLength(3);
    act(() => marks[0]!.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent('No content gap on this page');
  });

  it.each([
    ['not_computed', 'Content gaps not computed yet'],
    ['out_of_date', 'Content gap evidence is out of date'],
  ])('says above the rows when content gaps are %s', async (source, heading) => {
    serveList({ items: [healthOnly], status_counts: { open: 1 }, content_gap_source: source });
    renderWithProviders(<ContentOptimizationScreen />, {
      initialEntries: ['/agent/content'],
      projectSelection: selection,
    });

    expect(await screen.findByRole('link', { name: 'https://acme.test/guide' })).toBeVisible();
    expect(screen.getByText(heading)).toBeVisible();
  });

  it.each([
    [
      'not_computed',
      {},
      'Content gaps not computed yet',
      'They are found from the competitor and publisher pages AI answers cite, after a visibility run completes.',
    ],
    [
      'out_of_date',
      {},
      'Content gap evidence is out of date',
      'The newest visibility run behind it is too old to use, so no content gaps are listed. Run a visibility audit to refresh it.',
    ],
    // No status would show a gap, so the source state comes before the filter.
    [
      'out_of_date',
      { dismissed: 1 },
      'Content gap evidence is out of date',
      'The newest visibility run behind it is too old to use, so no content gaps are listed. Run a visibility audit to refresh it.',
    ],
    [
      'not_computed',
      { dismissed: 1 },
      'Content gaps not computed yet',
      'They are found from the competitor and publisher pages AI answers cite, after a visibility run completes.',
    ],
    [
      'current',
      {},
      'No content gaps',
      'Your latest visibility runs show no content angle that competitor or publisher pages are cited for and your site lacks.',
    ],
    [
      'current',
      { dismissed: 1 },
      'No content work matches this status',
      'Change the status to see other content work.',
    ],
  ])(
    'says why the list is empty when the source is %s with counts %o',
    async (source, counts, heading, description) => {
      serveList({ items: [], status_counts: counts, content_gap_source: source });
      renderWithProviders(<ContentOptimizationScreen />, {
        initialEntries: ['/agent/content'],
        projectSelection: selection,
      });

      expect(await screen.findByRole('heading', { level: 3, name: heading })).toBeVisible();
      expect(screen.getByText(description)).toBeVisible();
    },
  );
});

/**
 * An Action detail with one content-gap member carrying its stored evidence,
 * and the handoff its diagnosis names for that rule.
 */
function serveDetail(
  action: typeof pageAction | typeof plannedAction,
  rule: 'content_gap_improve_page' | 'content_gap_new_page',
  evidence: Record<string, unknown>,
) {
  const member = action.content_gaps[0]!.opportunity_id;
  const opportunity = {
    id: member,
    project_id: PROJECT,
    rule_id: rule,
    opportunity_type: 'topic',
    severity: 'medium',
    priority_score: 40,
    title: 'Competitors are cited for content you lack',
    target_key: 'x',
    target_prompt_id: null,
    target_url: action.target_url,
    target_theme: null,
    target_label: action.target_label,
    action_id: action.id,
    action_surface: action.surface,
    system_rank: 1,
    display_rank: 1,
    order_source: 'system',
    priority_factors: {},
    evidence_summary: { count: 1, kinds: [] },
    created_at: NOW,
    updated_at: NOW,
  };
  const { content_gaps: _gaps, ...item } = action;
  mswServer.use(
    http.get(`/api/v1/actions/${action.id}`, () =>
      HttpResponse.json({
        ...item,
        diagnosis: {
          handoff:
            rule === 'content_gap_new_page'
              ? { context: 'opportunity', workflow_id: 'article', opportunity_id: member }
              : { context: 'page_url', workflow_id: 'refresh_page' },
        },
        members: [
          { ...opportunity, remediation: 'Cover the angle.', content_gap_evidence: evidence },
        ],
        member_measurement: {},
        declarable_since: '2026-01-01T00:00:00Z',
        declaration: null,
      }),
    ),
    http.get('/api/v1/opportunities/:id', ({ params }) => {
      libraryReads.push(`opportunity ${String(params.id)}`);
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }),
    http.get(`/api/v1/projects/${PROJECT}/agent/chats`, () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
    http.get('/api/v1/prompt-sets', () => {
      libraryReads.push('prompt-sets');
      return HttpResponse.json({ prompt_sets: [] });
    }),
  );
}

/** Reads of the prompt library or a finding's Opportunity; the Action read carries the evidence. */
const libraryReads: string[] = [];
afterEach(() => {
  libraryReads.length = 0;
});

const angleEvidence = {
  run_id: '77777777-7777-4777-8777-777777777777',
  lineage_id: '88888888-8888-4888-8888-888888888888',
  topic_id: null,
  // As recorded at the refresh: one prompt with its text, one the library no longer had.
  prompts: [
    { id: PROMPT, text: 'Which CRM is cheapest?' },
    { id: '67676767-6767-4767-8767-676767676767', text: null },
  ],
  engines: ['chatgpt'],
  citation_count: 9,
  domain_count: 4,
  competitor_count: 2,
  member_count: 25,
  members: [
    {
      url: 'https://globex.com/pricing',
      title: 'Globex pricing explained',
      domain: 'globex.com',
      classification: 'competitor',
      matched_competitor: 'Globex',
      citation_count: 5,
    },
    {
      url: 'https://review.example/crm-pricing',
      title: 'CRM pricing compared',
      domain: 'review.example',
      classification: 'third_party',
      matched_competitor: null,
      citation_count: 4,
    },
  ],
  window: { start: '2026-10-01T00:00:00Z', end: '2026-10-31T00:00:00Z' },
  methodology_version: 'content-angles-1',
  formula_version: 'content-gaps-1',
  limitations: [],
};

function renderDetail(actionId: string) {
  renderWithProviders(
    <Routes>
      <Route path="/agent/content/:actionId" element={<ActionDetailScreen />} />
    </Routes>,
    { initialEntries: [`/agent/content/${actionId}`], projectSelection: selection },
  );
}

describe('A content-gap Action', () => {
  it('explains an improve-page gap from evidence and hands the page to the refresh workflow', async () => {
    serveDetail(pageAction, 'content_gap_improve_page', {
      ...angleEvidence,
      angle_label: 'Pricing comparison',
      site_url_id: '99999999-9999-4999-8999-999999999999',
      url: 'https://acme.test/crm-pricing',
      match_method: 'model_pick',
    });
    renderDetail(PAGE_ACTION);

    const why = await screen.findByRole('region', { name: 'Why this matters' });
    expect(await within(why).findByText('Pricing comparison')).toBeVisible();
    const counts = within(within(why).getByLabelText('Counts'));
    expect(counts.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      '9',
      '4',
      '2',
      '2',
      'Oct 1, 2026 to Oct 31, 2026',
    ]);
    expect(counts.getAllByRole('term').map((label) => label.textContent)).toEqual([
      'Citations',
      'Sites',
      'Competitors',
      'Prompts',
      'Window',
    ]);
    expect(
      within(why).getByRole('link', { name: 'Globex pricing explained (opens in a new tab)' }),
    ).toHaveAttribute('href', 'https://globex.com/pricing');
    expect(within(why).getByText('Globex (globex.com) · 5 citations')).toBeVisible();
    expect(within(why).getByText('Competitor')).toBeVisible();
    expect(within(why).getByText('review.example · 4 citations')).toBeVisible();
    expect(within(why).getByText('Third-party')).toBeVisible();
    expect(within(why).getByText('The 2 most cited of 25 pages.')).toBeVisible();
    // Both stored prompts are listed, as many as the count, with no library or Opportunity read.
    const prompts = within(within(why).getByRole('region', { name: 'Prompts' }));
    expect(prompts.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Which CRM is cheapest?',
      'A prompt no longer in your library',
    ]);
    expect(prompts.getByRole('link', { name: 'Which CRM is cheapest?' })).toHaveAttribute(
      'href',
      `/prompts/${PROMPT}?project=${PROJECT}`,
    );
    expect(libraryReads).toEqual([]);

    const handoff = new URL(
      screen.getByRole('link', { name: 'Work on this' }).getAttribute('href')!,
      'https://app.test',
    );
    expect(handoff.pathname).toBe('/agent');
    expect(Object.fromEntries(handoff.searchParams)).toEqual({
      action_id: PAGE_ACTION,
      target_url: 'https://acme.test/crm-pricing',
      workflow: 'refresh_page',
      project: PROJECT,
    });
    expect(screen.getByRole('link', { name: 'Back to Content optimization' })).toHaveAttribute(
      'href',
      `/agent/content?project=${PROJECT}`,
    );
  });

  it('hands a new-page gap to the article workflow with its Opportunity', async () => {
    serveDetail(plannedAction, 'content_gap_new_page', {
      ...angleEvidence,
      angle_label: 'Setup guide',
      planned_page_key: 'planned:setup-guide',
    });
    renderDetail(PLANNED_ACTION);

    const write = await screen.findByRole('link', { name: 'Write this page' });
    const handoff = new URL(write.getAttribute('href')!, 'https://app.test');
    expect(Object.fromEntries(handoff.searchParams)).toEqual({
      action_id: PLANNED_ACTION,
      opportunity_id: CREATE,
      workflow: 'article',
      project: PROJECT,
    });
    expect(screen.queryByRole('link', { name: 'Work on this with the agent' })).toBeNull();
  });

  it('keeps the back link of the list it was opened from, loading and loaded', async () => {
    // Moved to Actions by a later crawl, but opened from Content optimization.
    serveDetail({ ...pageAction, surface: 'actions' }, 'content_gap_improve_page', {
      ...angleEvidence,
      angle_label: 'Pricing comparison',
      site_url_id: '99999999-9999-4999-8999-999999999999',
      url: 'https://acme.test/crm-pricing',
      match_method: 'model_pick',
    });
    renderDetail(PAGE_ACTION);

    const back = { name: 'Back to Content optimization' };
    expect(screen.getByRole('link', back)).toHaveAttribute(
      'href',
      `/agent/content?project=${PROJECT}`,
    );
    expect(await screen.findByRole('region', { name: 'Why this matters' })).toBeVisible();
    expect(screen.getByRole('link', back)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Back to Actions' })).toBeNull();
  });
});
