import { describe, expect, it } from 'vite-plus/test';

import type { Visibility } from '@citeladder/contracts';
import { formatRate, formatScore, visibleEngines } from './dashboard';

const AUDIT_A = '11111111-1111-4111-8111-111111111111';

function makeVisibility(overrides: Partial<Visibility> = {}): Visibility {
  return {
    project_id: '44444444-4444-4444-8444-444444444444',
    audit_id: AUDIT_A,
    audit_status: 'completed',
    analyzer_version: 'v1',
    scoring_rule_version: 'v1',
    cohort: 'core',
    coverage: { completed: 6, requested: 6, rate: 1 },
    total_completed: 6,
    total_failed: 0,
    visibility_score: 66.7,
    model_provenance: [],
    rankings: [],
    per_engine: [],
    avg_position: null,
    created_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('visibility dashboard helpers', () => {
  it('formats rates and scores, a missing one as not measured', () => {
    expect(formatRate(0.5)).toBe('50.0%');
    expect(formatRate(null)).toEqual({ absent: 'not_measured' });
    expect(formatScore(72.4)).toBe('72');
    expect(formatScore(null)).toEqual({ absent: 'not_measured' });
  });

  it('orders engines by canonical order and applies the engine filter', () => {
    const visibility = makeVisibility({
      per_engine: [
        {
          logical_engine: 'claude',
          total_completed: 2,
          brand_mention_rate: 0.5,
          owned_citation_rate: null,
          search_use_rate: null,
          visibility_score: 50,
        },
        {
          logical_engine: 'chatgpt',
          total_completed: 2,
          brand_mention_rate: 0.8,
          owned_citation_rate: null,
          search_use_rate: null,
          visibility_score: 80,
        },
      ],
    });
    const order = ['chatgpt', 'gemini', 'claude'];
    expect(visibleEngines(visibility, 'all', order).map((e) => e.logical_engine)).toEqual([
      'chatgpt',
      'claude',
    ]);
    expect(
      visibleEngines(visibility, 'all', ['claude', 'chatgpt']).map((e) => e.logical_engine),
    ).toEqual(['claude', 'chatgpt']);
    expect(visibleEngines(visibility, 'claude', order).map((e) => e.logical_engine)).toEqual([
      'claude',
    ]);
  });
});
