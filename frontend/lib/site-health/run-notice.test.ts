import { describe, expect, it } from 'vitest';

import { dashboardRunNotice } from './run-notice';

describe('dashboardRunNotice', () => {
  it('reports unfetched links without the redundant analysis-complete sentence', () => {
    const notice = dashboardRunNotice({
      status: 'partially_completed',
      analyzed_count: 4,
      error_message: '',
      failure_summary: null,
      partial_reason: 'discovery_incomplete',
    });

    expect(notice?.message).toBe(
      'Some links could not be fetched — they were dead, blocked, or not web pages.',
    );
  });
});
