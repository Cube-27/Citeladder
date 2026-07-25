import { describe, expect, it } from 'vitest';

import { brandVisibilityHistory } from '@/lib/visibility/trends';
import type { VisibilityTrendPoint } from '@/lib/api/types';

/** Minimal trend point carrying only the fields the helper reads. */
function point(rankings: { name: string; mention_rate: number | null }[]): VisibilityTrendPoint {
  return {
    audit_id: null,
    completed_at: '2026-07-01T00:00:00Z',
    logical_engine: null,
    visibility_score: null,
    brand_mention_rate: null,
    owned_citation_rate: null,
    sov: { response: null, mention: null },
    rankings: rankings.map((r) => ({
      name: r.name,
      is_brand: false,
      mention_rate: r.mention_rate,
      citation_rate: null,
      share_of_voice: null,
      mention_count: 0,
      sentiment: null,
      avg_position: null,
    })),
    sentiment: null,
    avg_position: null,
    source_snapshot_ids: [],
    analyzer_versions: [],
    scoring_rule_versions: [],
    spans_version_boundary: false,
  } as unknown as VisibilityTrendPoint;
}

describe('brandVisibilityHistory', () => {
  it('collects a 0-100 series per brand across points', () => {
    const history = brandVisibilityHistory([
      point([
        { name: 'Us', mention_rate: 0.6 },
        { name: 'Them', mention_rate: 0.4 },
      ]),
      point([
        { name: 'Us', mention_rate: 0.65 },
        { name: 'Them', mention_rate: 0.35 },
      ]),
    ]);
    expect(history.get('Us')).toEqual([60, 65]);
    expect(history.get('Them')).toEqual([40, 35]);
  });

  it('skips unreadable points instead of zero-filling them', () => {
    const history = brandVisibilityHistory([
      point([{ name: 'Us', mention_rate: 0.5 }]),
      point([{ name: 'Us', mention_rate: null }]),
      point([{ name: 'Us', mention_rate: 0.7 }]),
    ]);
    // The null point is dropped — never coerced to a misleading 0.
    expect(history.get('Us')).toEqual([50, 70]);
  });

  it('drops a brand with fewer than two readable points (no flat fake line)', () => {
    const history = brandVisibilityHistory([
      point([
        { name: 'Us', mention_rate: 0.5 },
        { name: 'OneOff', mention_rate: 0.3 },
      ]),
      point([{ name: 'Us', mention_rate: 0.55 }]),
    ]);
    expect(history.has('Us')).toBe(true);
    expect(history.has('OneOff')).toBe(false);
  });

  it('returns an empty map for no points', () => {
    expect(brandVisibilityHistory([]).size).toBe(0);
  });
});
