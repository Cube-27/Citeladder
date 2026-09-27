/**
 * Opportunity decisions the seeded PostgreSQL scenario never reaches: earned
 * page selection and scoring, and which site changes promote to a rule.
 */
import { describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import type { SourcePageEvidence } from '../src/analysis/opportunities/evidence.ts';
import { detectEarnedPageOpportunities } from '../src/analysis/opportunities/earned-pages.ts';
import { changeRule } from '../src/opportunities/refresh-hits.ts';

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
    expect(content({ ...complete, content_change_classification: 'rewritten' })).toBe(
      'site_change_metadata_inconsistency',
    );
    expect(content({ ...complete, comparison_coverage: 'partial' })).toBeNull();
    expect(content(null)).toBeNull();
  });
});
