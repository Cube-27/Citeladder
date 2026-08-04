import { describe, expect, it } from 'vitest';

import { activationSteps, recommendationPollingInterval } from './activation-progress';

describe('activationSteps', () => {
  it('moves from page discovery to page analysis using persisted crawl substates', () => {
    const discovering = activationSteps({
      pageLimit: 10,
      recommendationState: 'waiting_for_evidence',
      crawl: {
        status: 'running',
        discovery_status: 'running',
        visible_url_count: 3,
        analyzed_count: 0,
      },
    });
    const analyzing = activationSteps({
      pageLimit: 10,
      recommendationState: 'waiting_for_evidence',
      crawl: {
        status: 'running',
        discovery_status: 'completed',
        visible_url_count: 10,
        analyzed_count: 4,
      },
    });

    expect(discovering.map((step) => step.state)).toEqual([
      'complete',
      'active',
      'pending',
      'pending',
      'pending',
    ]);
    expect(analyzing.map((step) => step.state)).toEqual([
      'complete',
      'complete',
      'active',
      'pending',
      'pending',
    ]);
    expect(analyzing[2]?.detail).toBe('4 pages checked');
  });

  it('shows recommendation delay as the only retryable attention state', () => {
    const steps = activationSteps({
      pageLimit: 10,
      recommendationState: 'delayed',
      crawl: {
        status: 'completed',
        discovery_status: 'completed',
        visible_url_count: 10,
        analyzed_count: 10,
      },
    });

    expect(steps[3]).toMatchObject({ state: 'attention' });
    expect(JSON.stringify(steps)).not.toMatch(/site_crawl|metric_snapshot|formula_version/);
  });

  it('does not present a failed website review as completed work', () => {
    const steps = activationSteps({
      pageLimit: 10,
      recommendationState: 'waiting_for_evidence',
      crawl: {
        status: 'failed',
        discovery_status: 'failed',
        visible_url_count: 1,
        analyzed_count: 0,
      },
    });

    expect(steps[1]?.state).toBe('attention');
    expect(steps[2]).toMatchObject({
      state: 'attention',
      detail: 'The website review needs attention.',
    });
    expect(steps[3]?.state).toBe('pending');
    expect(recommendationPollingInterval(true, 'waiting_for_evidence')).toBe(false);
  });
});
