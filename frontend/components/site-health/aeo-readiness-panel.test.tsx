import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { AeoReadinessPanel as ScopedAeoReadinessPanel } from './aeo-readiness-panel';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const CRAWL = '22222222-2222-4222-8222-222222222222';
const ANALYSIS = '33333333-3333-4333-8333-333333333333';
const PAGE_A = '44444444-4444-4444-8444-444444444444';
const PAGE_B = '55555555-5555-4555-8555-555555555555';

const DIMENSIONS = [
  ['answerability', 'Answerability'],
  ['structure', 'Structure'],
  ['evidence', 'Evidence'],
  ['machine-readability', 'Machine readability'],
  ['provenance', 'Provenance'],
  ['freshness', 'Freshness'],
  ['crawlability', 'Crawlability'],
] as const;

function AeoReadinessPanel(props: Readonly<{ projectId: string; crawlId: string }>) {
  return <ScopedAeoReadinessPanel workspaceId={WORKSPACE} summary={null} {...props} />;
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function dimension(key: string, label: string, failing: boolean) {
  const ruleId = `rule.${key}.0`;
  return {
    key,
    label,
    description: `What ${label.toLowerCase()} means in one sentence.`,
    dimension_applicability: 'applicable',
    dimension_measurement_state: 'measured',
    score: failing ? 60 : 100,
    reason: '',
    checkpoint_ids: [ruleId],
    determinate_checkpoint_ids: [ruleId],
    unresolved_count: 0,
    earned_points: failing ? 3 : 5,
    determinate_points: 5,
    expected_points: 6,
    satisfied_count: failing ? 3 : 4,
    partial_count: 0,
    missing_count: failing ? 2 : 0,
    unknown_count: 0,
    not_applicable_count: 1,
    error_count: 0,
    coverage: 0.8333,
    checked_page_count: 5,
    failing_page_count: failing ? 2 : 0,
    checks: [
      {
        rule_id: ruleId,
        scope: 'page',
        title: failing ? 'Answer is not stated first' : 'Headings are unique',
        remediation: 'Move the direct answer into the first paragraph.',
        satisfied_count: failing ? 3 : 4,
        partial_count: 0,
        missing_count: failing ? 2 : 0,
        unknown_count: 0,
        not_applicable_count: 1,
        error_count: 0,
        failing_entity_count: failing ? 2 : 0,
        aeo_pillar: key,
        content_addressable: true,
        remediation_route: 'content',
      },
    ],
    evidence_pages: failing
      ? [
          {
            site_url_id: PAGE_A,
            source_analysis_id: ANALYSIS,
            normalized_url: 'https://acme.test/blogs/american-summer',
            failed_checks: [
              {
                rule_id: ruleId,
                title: 'Answer is not stated first',
                observed_evidence: { observed: 'missing' },
                expected_capability: 'State the answer first.',
                remediation: 'Move the direct answer into the first paragraph.',
                content_addressable: true,
                remediation_route: 'content',
              },
              {
                rule_id: `rule.${key}.1`,
                title: 'No question headings',
                observed_evidence: { observed: 'missing' },
                expected_capability: 'Use question-shaped headings.',
                remediation: 'Add question-shaped headings.',
                content_addressable: true,
                remediation_route: 'content',
              },
            ],
          },
          {
            site_url_id: PAGE_B,
            source_analysis_id: ANALYSIS,
            normalized_url: 'https://acme.test/blogs/rooted-in-fall',
            failed_checks: [
              {
                rule_id: ruleId,
                title: 'Answer is not stated first',
                observed_evidence: { observed: 'missing' },
                expected_capability: 'State the answer first.',
                remediation: 'Move the direct answer into the first paragraph.',
                content_addressable: true,
                remediation_route: 'content',
              },
            ],
          },
        ]
      : [],
    evidence_truncated: false,
  };
}

function stubReadiness(overrides: Record<string, unknown> = {}) {
  mswServer.use(
    http.get(`/api/v1/site-crawls/${CRAWL}/issues`, () =>
      HttpResponse.json({
        items: [],
        next_cursor: null,
        summary: {
          issue_count: 0,
          occurrence_count: 0,
          severity_counts: {},
          dimension_counts: {},
          affected_url_count: 0,
          monitored_affected_url_count: 0,
          section_counts: { technical: 0, content: 0, aeo: 0 },
        },
      }),
    ),
    http.get(`/api/v1/projects/${PROJECT}/site-health/aeo-readiness`, () =>
      HttpResponse.json({
        state: 'measured',
        crawl_id: CRAWL,
        score: 82,
        coverage: 0.95,
        profile_version: 'site-health-profile-1',
        schema_contract_version: 'site-health-schema-contract-1',
        scoring_version: 'sh-score-1',
        presentation_version: 'site-health-presentation-1',
        analyzer_version: 'page-v1',
        analysis_count: 5,
        affected_page_count: 2,
        dimensions: DIMENSIONS.map(([key, label], index) => dimension(key, label, index === 0)),
        limitations: [],
        ...overrides,
      }),
    ),
  );
}

describe('AEO readiness', () => {
  it('renders all seven dimensions', async () => {
    stubReadiness();
    renderWithProviders(<AeoReadinessPanel projectId={PROJECT} crawlId={CRAWL} />);

    const table = await screen.findByRole('table', { name: 'Dimensions' });
    for (const [, label] of DIMENSIONS) expect(within(table).getByText(label)).toBeInTheDocument();
  });

  it('gives each dimension its issues, pages affected and largest issue', async () => {
    stubReadiness();
    renderWithProviders(<AeoReadinessPanel projectId={PROJECT} crawlId={CRAWL} />);

    const table = await screen.findByRole('table', { name: 'Dimensions' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Dimension', 'Score', 'Score bar', 'Issues', 'Pages affected', 'Largest issue']);
    const failing = within(table).getByText('Answerability').closest('tr')!;
    expect(
      within(failing)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Answerability', '60', '', '1', '2', 'Answer is not stated first']);
    const clean = within(table).getByText('Structure').closest('tr')!;
    expect(
      within(clean)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Structure', '100', '', '0', '0', '']);
    expect(
      within(failing).getByRole('link', { name: 'Answer is not stated first' }),
    ).toHaveAttribute('href', '/issues?rule=rule.answerability.0');
    expect(within(table).queryByRole('button')).toBeNull();
  });

  it('shows the persisted empty state rather than an empty grid', async () => {
    stubReadiness({ state: 'not_measured', crawl_id: null, limitations: ['Run a crawl first.'] });
    renderWithProviders(<AeoReadinessPanel projectId={PROJECT} crawlId={CRAWL} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Run a crawl first.');
  });
});
