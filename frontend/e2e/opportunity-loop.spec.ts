import { expect, test } from '@playwright/test';
import { FIXTURE_PROJECT, stubAuthedShell } from './helpers/app-fixture';

const PROJECT = FIXTURE_PROJECT.id;
const OPPORTUNITY = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT = '33333333-3333-4333-8333-333333333333';
const IMPLEMENTATION = '55555555-5555-4555-8555-555555555555';

/** The loop reads the project's industry into its brief, so those two fields
 * are stated; everything else is the shared shell project. */
const project = {
  ...FIXTURE_PROJECT,
  industry: 'Software',
  subindustry: 'Analytics',
  primary_market: 'US',
};

const mix = {
  state: 'available',
  projection_version: 'opportunity-source-mix-1',
  taxonomy_version: 'source-taxonomy-2',
  counts: { earned: 2, owned: 1, competitive_evidence: 1 },
  percentages: { earned: 50, owned: 25, competitive_evidence: 25 },
  observation_count: 4,
  answers_with_sources: 3,
  eligible_analyzed_answers: 4,
  coverage_rate: 0.75,
  limitations: [],
};

const row = {
  id: OPPORTUNITY,
  project_id: PROJECT,
  rule_id: 'earned_source_recurs_beside_gap',
  opportunity_type: 'visibility',
  severity: 'high',
  priority_score: 140,
  title: 'Prepare an earned inclusion for example.org',
  target_key: 'earned-source:editorial:example.org',
  target_prompt_id: null,
  target_url: null,
  target_theme: 'analytics',
  target_label: 'example.org',
  status: 'open',
  system_rank: 1,
  display_rank: 1,
  order_source: 'system',
  priority_factors: { usage_factor: 2, buyer_stage: 'decision' },
  evidence_summary: { count: 2, kinds: ['response_analysis'] },
  created_at: '2026-08-28T00:00:00Z',
  updated_at: '2026-08-28T00:00:00Z',
};

const handoff = {
  opportunity_id: OPPORTUNITY,
  pathway: 'earned',
  source_class: 'editorial',
  canonical_domain: 'example.org',
  suggested_role: 'Earned Media',
  suggested_skill_id: 'article',
  target_url: null,
  target_theme: 'analytics',
  representative_citations: [{ url: 'https://example.org/tools', title: 'Analytics tools' }],
  affected_prompt_indices: [0, 1],
  affected_themes: ['analytics'],
  observed_competitors: ['Rival'],
  coverage: { eligible_answers: 4, observed_answers: 2 },
  limitations: ['Human review and outreach are required.'],
  truncated: false,
  source_analysis_ids: [SNAPSHOT],
  snapshot_versions: { source_taxonomy: 'source-taxonomy-2' },
};

function detail() {
  return {
    ...row,
    remediation: 'Prepare a transparent expert-contribution brief.',
    evidence: {
      audit_id: SNAPSHOT,
      source_pattern: { source_class: 'editorial' },
    },
    source_analysis_ids: [SNAPSHOT],
    source_issue_ids: [],
    source_metric_ids: [SNAPSHOT],
    source_traffic_ids: [],
    analyzer_version: 'opp-analyzer-7',
    rule_version: 'opp-rules-8',
    formula_version: 'opp-formula-3',
    content_handoff: handoff,
    superseded_by_id: null,
    superseded_at: null,
  };
}

const verificationResult = {
  state: 'available',
  legs: {
    visibility: { state: 'available' },
    ai_referral_traffic: { state: 'observed_zero' },
    branded_search_demand: { state: 'unavailable' },
  },
  gap_changes: {
    state: 'available',
    no_longer_observed: ['gap:old'],
    persistent: ['gap:same'],
    new: ['gap:new'],
  },
  overlapping_action_ids: [],
  causality_notice: 'Later observations do not prove causality.',
};

const opportunitySummary = {
  activation_state: 'ready',
  computed: true,
  run_id: SNAPSHOT,
  audit_id: SNAPSHOT,
  site_crawl_id: null,
  demand_snapshot_id: null,
  demand_source_revision: null,
  coverage: {},
  limitations: [],
  source_mix: mix,
  action_path_mix: mix,
  domain_rollups: [],
  counts_by_type: { visibility: 1 },
  counts_by_severity: { high: 1 },
  counts_by_status: { open: 1 },
  total_count: 1,
  median_priority: 140,
  analyzer_version: 'opp-analyzer-7',
  rule_version: 'opp-rules-8',
  formula_version: 'opp-formula-3',
  computed_at: '2026-08-28T00:00:00Z',
  evidence_updated_at: '2026-08-28T00:00:00Z',
  stale: false,
};

test('earned opportunity declaration shows comparable verification', async ({ page }) => {
  let declarationBody: Record<string, unknown> | null = null;

  await stubAuthedShell(page, [], [project]);
  await page.route(`**/api/v1/projects/${PROJECT}/logos/refresh`, (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route(`**/api/v1/projects/${PROJECT}/opportunities/summary`, (route) =>
    route.fulfill({ json: opportunitySummary }),
  );
  await page.route(`**/api/v1/projects/${PROJECT}/opportunities?*`, (route) =>
    route.fulfill({ json: { items: [row], next_cursor: null } }),
  );
  await page.route(`**/api/v1/opportunities/${OPPORTUNITY}`, (route) =>
    route.fulfill({ json: detail() }),
  );
  await page.route(`**/api/v1/projects/${PROJECT}/opportunities/implementation-events?*`, (route) =>
    route.fulfill({ json: { items: [], next_cursor: null } }),
  );
  await page.route(
    `**/api/v1/projects/${PROJECT}/opportunities/implementation-events`,
    async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ json: { items: [], next_cursor: null } });
      }
      declarationBody = (await route.request().postDataJSON()) as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          id: IMPLEMENTATION,
          project_id: PROJECT,
          opportunity_id: OPPORTUNITY,
          opportunity_snapshot_id: SNAPSHOT,
          target_site_url_ids: [],
          target_external_url: null,
          declared_implemented_at: '2026-08-28T00:03:00Z',
          expected_checks: [
            {
              kind: 'visibility_metric',
              metric: 'visibility_score',
              direction: 'increase',
              expected_value: 1,
              tolerance: 0,
            },
          ],
          state: 'verified',
          limitations: [],
          verification_events: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              observation_kind: 'verified',
              observed_at: '2026-08-28T00:04:00Z',
              crawl_id: null,
              audit_id: SNAPSHOT,
              source_analysis_ids: [SNAPSHOT],
              source_rule_evaluation_ids: [],
              source_metric_ids: [SNAPSHOT],
              result: verificationResult,
              verifier_version: 'implementation-verifier-2',
              limitations: [],
              created_at: '2026-08-28T00:04:00Z',
            },
          ],
          created_at: '2026-08-28T00:03:00Z',
        },
      });
    },
  );
  await page.goto('/opportunities');
  await page.getByRole('button', { name: 'Review recommendation' }).click();
  await page.getByRole('button', { name: 'I implemented this' }).click();

  await expect(page.getByText('visibility: available')).toBeVisible();
  await expect(page.getByText('ai referral traffic: observed zero')).toBeVisible();
  await expect(page.getByText('Gaps: 1 no longer observed · 1 persistent · 1 new')).toBeVisible();
  expect(declarationBody).toMatchObject({
    opportunity_id: OPPORTUNITY,
    expected_checks: [],
  });
});

test('opportunity filters and detail restore through URL history and reload', async ({ page }) => {
  await stubAuthedShell(page, [], [project]);
  await page.route(`**/api/v1/projects/${PROJECT}/opportunities/summary`, (route) =>
    route.fulfill({ json: opportunitySummary }),
  );
  await page.route(`**/api/v1/projects/${PROJECT}/opportunities?*`, (route) =>
    route.fulfill({ json: { items: [row], next_cursor: null } }),
  );
  await page.route(`**/api/v1/opportunities/${OPPORTUNITY}`, (route) =>
    route.fulfill({ json: detail() }),
  );

  await page.goto(`/opportunities?project=${PROJECT}&opportunity=${OPPORTUNITY}&keep=1#evidence`);
  await expect(page.getByRole('dialog', { name: 'Opportunity detail' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('selected')).toBe(OPPORTUNITY);
  expect(new URL(page.url()).searchParams.has('opportunity')).toBe(false);

  await page.getByRole('button', { name: 'Close drawer' }).click();
  await page.getByRole('button', { name: 'Review recommendation' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Opportunity detail' })).not.toBeVisible();
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Opportunity detail' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Opportunity detail' })).toBeVisible();

  await page.getByRole('button', { name: 'Close drawer' }).click();
  await page.getByRole('button', { name: /Path:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Earned' }).click();
  await expect(page.getByRole('dialog', { name: 'Opportunity detail' })).not.toBeVisible();
  await expect
    .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
    .toMatchObject({ project: PROJECT, keep: '1', action_path: 'earned' });
  expect(new URL(page.url()).hash).toBe('#evidence');
  expect(new URL(page.url()).searchParams.has('selected')).toBe(false);
});
