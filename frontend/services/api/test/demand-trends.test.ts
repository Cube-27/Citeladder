import { describe, expect, it } from 'vitest';
import { policy } from '../src/config.ts';
import { detectTrends } from '../src/demand/detectors.ts';
import type { QueryInput } from '../src/demand/projection.ts';
import { addDays } from '../src/referrals/projection.ts';

const p = policy.demand;
const windowEnd = '2026-09-28';
const recentDay = windowEnd;
const priorDay = addDays(windowEnd, -p.DEMAND_TREND_WINDOW_DAYS);
const beforeWindows = addDays(windowEnd, -2 * p.DEMAND_TREND_WINDOW_DAYS);

function row(
  query: string,
  observed: string,
  impressions: number,
  classification = 'non_branded',
): QueryInput {
  return {
    observed_date: observed,
    property_ref: 'sc-domain:example.com',
    normalized_query: query,
    resolved_page_url: `https://example.com/${query.replaceAll(' ', '-')}`,
    resolution_outcome: 'exact',
    classification,
    classifier_version: 'v1',
    classification_override_id: null,
    impressions,
    clicks: 0,
    position: 5,
    source_metric_row_id: `${query}-${observed}`,
    source_artifact_id: 'artifact',
    page_title: '',
    page_h1_texts: [],
    page_primary_content: '',
    page_content_usable: false,
    page_analysis_id: null,
    page_artifact_id: null,
  };
}

/** Branded rows give every required day coverage without joining a trend group. */
const coverage = Array.from({ length: p.DEMAND_TREND_REQUIRED_DAYS }, (_, day) =>
  row('brand', addDays(windowEnd, -day), 1, 'branded'),
);

describe('query trend detection', () => {
  it('classifies emerging and declining queries from the two comparison windows only', () => {
    const result = detectTrends(
      [
        ...coverage,
        row('rising widgets', priorDay, 20),
        row('rising widgets', recentDay, 60),
        row('falling widgets', priorDay, 60),
        row('falling widgets', recentDay, 20),
        // Impressions before the prior window must not turn a flat query into a decline.
        row('steady widgets', beforeWindows, 1000),
        row('steady widgets', priorDay, 40),
        row('steady widgets', recentDay, 40),
        // A window below the minimum is not evidence of emergence.
        row('thin widgets', priorDay, p.DEMAND_TREND_MIN_WINDOW_IMPRESSIONS - 1),
        row('thin widgets', recentDay, 80),
      ],
      windowEnd,
    );
    expect(result.state).toBe('available');
    expect(
      result.candidates.map(({ topic_cluster, signal_type, metrics }) => ({
        topic_cluster,
        signal_type,
        prior: metrics.prior_impressions,
        recent: metrics.recent_impressions,
      })),
    ).toEqual([
      {
        topic_cluster: 'falling widgets',
        signal_type: p.DEMAND_SIGNAL_DECLINING_QUERY,
        prior: 60,
        recent: 20,
      },
      {
        topic_cluster: 'rising widgets',
        signal_type: p.DEMAND_SIGNAL_EMERGING_QUERY,
        prior: 20,
        recent: 60,
      },
    ]);
  });

  it('abstains when any required day lacks coverage', () => {
    const result = detectTrends(
      [
        ...coverage.filter((r) => r.observed_date !== addDays(windowEnd, -3)),
        row('rising widgets', priorDay, 20),
        row('rising widgets', recentDay, 60),
      ],
      windowEnd,
    );
    expect(result).toMatchObject({ state: 'insufficient_history', candidates: [] });
  });
});
