import { describe, expect, it } from 'vite-plus/test';

import { placementReport } from './verification';

/**
 * Four outcomes, and the two a careless reading collapses.
 *
 * "Nobody has read the page since you declared this" and "the page could not
 * be compared against its baseline" are not "the change is not there". Telling
 * a user their work failed when nothing was looked at is the same defect as
 * reporting an unread page as a confirmed absence.
 */
describe('reporting a placement observation', () => {
  it('has nothing to say about an owned-page action', () => {
    expect(placementReport({ legs: {} })).toBeNull();
    expect(placementReport(undefined)).toBeNull();
  });

  it('names the change that went live, and keeps it apart from the score', () => {
    const report = placementReport({
      placement: { state: 'live', expected_change: 'discrepancy_resolved' },
    });

    expect(report?.headline).toBe('The page no longer says what was wrong.');
    expect(report?.detail).toContain('separate observations');
  });

  it('says a page has not been read rather than that the work failed', () => {
    const report = placementReport({ placement: { state: 'not_run' } });

    expect(report?.headline).toBe('The page has not been read since this was declared.');
  });

  it('distinguishes a reading still to come from the last one', () => {
    const pending = placementReport({
      placement: { state: 'not_observed', attempts: 1, max_attempts: 4, due_at: '2026-10-01' },
    });
    const finished = placementReport({
      placement: { state: 'not_observed', attempts: 4, max_attempts: 4, due_at: null },
    });

    expect(pending?.detail).toContain('will be read again');
    expect(finished?.detail).toContain('as often as it will be');
  });

  it('explains why a comparison could not be made', () => {
    const report = placementReport({
      placement: { state: 'unavailable', reason: 'roster_changed' },
    });

    expect(report?.headline).toBe('This placement could not be confirmed.');
    expect(report?.detail).toContain('do not answer the same question');
  });
});
