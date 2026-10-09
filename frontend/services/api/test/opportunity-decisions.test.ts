/**
 * Opportunity decisions the seeded PostgreSQL scenario never reaches: earned
 * page selection and scoring, which site changes promote to a rule, how a
 * confirmed decline ranks, and how verification folds per-check readings.
 */
import { describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import type { SourcePageEvidence } from '../src/analysis/opportunities/evidence.ts';
import { detectEarnedPageOpportunities } from '../src/analysis/opportunities/earned-pages.ts';
import { changeRule } from '../src/opportunities/refresh-hits.ts';
import { declineGap, declineValue } from '../src/opportunities/refresh-evidence.ts';
import { priorityScore } from '../src/analysis/opportunities/scoring.ts';
import {
  mergeOutcomes,
  observationKind,
  type CheckOutcome,
} from '../src/opportunities/verification-decisions.ts';

const e = policy.opportunity.earned_actions;
const s = policy.opportunity.source_pages;
const r = policy.opportunity.refresh;

const entity = (kind: string, name: string, presence: string, matches = 1) => ({
  entity_kind: kind,
  entity_name: name,
  presence,
  match_method: 'alias',
  match_count: matches,
  passages: [],
});

function page(overrides: Partial<SourcePageEvidence> = {}): SourcePageEvidence {
  return {
    url_hash: 'hash-a',
    canonical_url: 'https://review.example/best-crm',
    registrable_domain: 'review.example',
    page_format: 'listicle',
    page_format_method: 'rule',
    inspection_state: s.INSPECTION_INSPECTED,
    inspection_reason: null,
    snapshot_id: 'snapshot-2',
    extracted_chars: s.SOURCE_PAGE_MIN_COVERAGE_CHARS,
    sufficient_coverage: true,
    title: 'Best CRM tools',
    headings: ['Rival One', 'Rival Two'],
    outbound_domains: [],
    content_hash: 'content-2',
    entities: [
      entity(s.ENTITY_KIND_BRAND, 'Acme', s.PRESENCE_NOT_DETECTED, 0),
      entity(s.ENTITY_KIND_COMPETITOR, 'Rival One', s.PRESENCE_PRESENT),
      entity(s.ENTITY_KIND_COMPETITOR, 'Rival Two', s.PRESENCE_PRESENT),
    ],
    prior: null,
    roster_current: true,
    source_class: null,
    recurrence_count: 3,
    answer_count: 3,
    prompt_indices: [0, 1],
    themes: ['crm'],
    analysis_ids: ['analysis-1'],
    answer_competitors: [],
    requested: false,
    ...overrides,
  };
}

const detect = (pages: SourcePageEvidence[]) =>
  detectEarnedPageOpportunities({
    pages,
    owned_domains: ['acme.test'],
    eligible_answers: 6,
    inspected_pages: pages.length,
    total_pages: pages.length,
  });

describe('earned page opportunities', () => {
  it('asks to acquire a listing and scores recurrence and competitor presence', () => {
    const [hit] = detect([page()]);
    expect(hit).toMatchObject({
      rule_id: e.RULE_EARNED_PAGE_ACQUIRE,
      target_key: `${e.EARNED_PAGE_TARGET_PREFIX}hash-a`,
      source_analysis_ids: ['analysis-1'],
      value_factor: 1.5,
      gap_factor: 1 + 2 * e.EARNED_PAGE_COMPETITOR_FACTOR_STEP,
    });
  });

  it('defends a listing the brand lost since the prior inspection', () => {
    const prior = {
      snapshot_id: 'snapshot-1',
      brand_present: true,
      brand_match_count: 2,
      present_competitors: ['Rival One'],
      content_hash: 'content-1',
    };
    expect(detect([page({ prior })])[0]?.rule_id).toBe(e.RULE_EARNED_PAGE_DEFEND);
  });

  it('researches an uninspected page only once it recurs or is requested', () => {
    const uninspected = { inspection_state: s.INSPECTION_NOT_INSPECTED, snapshot_id: null };
    expect(detect([page(uninspected)])).toEqual([]);
    expect(detect([page({ ...uninspected, requested: true })])[0]?.rule_id).toBe(
      e.RULE_EARNED_PAGE_RESEARCH,
    );
  });
});

describe('site change promotion', () => {
  const content = (after: unknown) =>
    changeRule({ change_class: 'changed', field: r.content_change_field, after });

  it('promotes approved regressions by class', () => {
    expect(changeRule({ change_class: r.change_class_critical, field: 'title', after: null })).toBe(
      'site_change_critical_regression',
    );
  });

  it('reads metadata inconsistency only from a complete comparison', () => {
    const complete = { comparison_coverage: 'complete', metadata_consistency: 'inconsistent' };
    expect(content({ ...complete, content_change_classification: 'unchanged' })).toBe(
      'site_change_cosmetic_refresh',
    );
    expect(content({ ...complete, content_change_classification: 'minor_change' })).toBe(
      'site_change_metadata_inconsistency',
    );
    // A substantial rewrite stays in change history instead of becoming an action.
    expect(
      content({ ...complete, content_change_classification: 'substantial_change' }),
    ).toBeNull();
    expect(content({ ...complete, comparison_coverage: 'partial' })).toBeNull();
    expect(content(null)).toBeNull();
  });
});

describe('confirmed decline ranking', () => {
  const o = policy.opportunity.opportunities;
  const floor = policy.audits.analysis.prompt_decline_materiality_points;
  const score = (confidence: number, delta: number | null) =>
    priorityScore('high', declineValue(confidence), declineGap(delta));

  it('surfaces every decline the audit confirmed, however weak the agreement', () => {
    expect(score(0, -floor)).toBeGreaterThanOrEqual(o.MIN_PRIORITY_TO_SURFACE);
    expect(score(0.3, null)).toBeGreaterThanOrEqual(o.MIN_PRIORITY_TO_SURFACE);
  });

  it('ranks a larger, more agreed decline above a marginal one, up to the cap', () => {
    expect(score(0.9, -2 * floor)).toBeGreaterThan(score(0.4, -floor));
    expect(score(1, -100 * floor)).toBe(score(1, -o.CONFIRMED_DECLINE_GAP_CAP * floor));
  });
});

describe('verification folding', () => {
  const read = (
    state: CheckOutcome['state'],
    at: string,
    source_kind = 'site_crawl',
  ): CheckOutcome => ({
    state,
    reason: state === 'unavailable' ? 'page_not_analyzed' : null,
    observed_at: at,
    source_kind,
    source_id: `${source_kind}-${at}`,
  });
  const fold = (...readings: Map<number, CheckOutcome>[]) =>
    readings.reduce((merged, next) => mergeOutcomes(merged, next), new Map());

  it('never lets a reading that could not answer replace an answer', () => {
    const merged = fold(
      new Map([[0, read('met', '2026-10-01')]]),
      new Map([[0, read('unavailable', '2026-10-05')]]),
    );
    expect(merged.get(0)?.state).toBe('met');
  });

  it('keeps the newer answer whichever order the sources arrive in', () => {
    const older = new Map([[0, read('met', '2026-10-01')]]);
    const newer = new Map([[0, read('unmet', '2026-10-05')]]);
    expect(fold(older, newer).get(0)?.state).toBe('unmet');
    expect(fold(newer, older).get(0)?.state).toBe('unmet');
  });

  it('verifies only once every check has its own met reading', () => {
    const crawl = new Map([[0, read('met', '2026-10-01')]]);
    const traffic = new Map([[1, read('met', '2026-10-02', 'traffic_snapshot')]]);
    expect(observationKind(fold(crawl), 2)).toBe('observed');
    expect(observationKind(fold(crawl, traffic), 2)).toBe('verified');
    expect(observationKind(fold(crawl, new Map([[1, read('unmet', '2026-10-03')]])), 2)).toBe(
      'contradicted',
    );
  });
});
