'use client';

import { Alert } from '@/components/ui/alert';
import { MutationNotice } from '@/components/ui/mutation-notice';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import type { QuotaStatus } from '@/lib/site-health/selection';

/**
 * The stacked alert strip for the monitored-selection flow: bulk failure,
 * over-quota warning, stale-version merge notice, and commit failure. Purely
 * presentational — visibility rules mirror the container's mutation state.
 * Mutation failures render through the shared A4 notice (verbatim 4xx,
 * transient retry, support correlation).
 */
export function SelectionNotices({
  bulkNotice,
  onBulkRetry,
  quota,
  staleNotice,
  replaceNotice,
  onReplaceRetry,
}: Readonly<{
  bulkNotice: MutationNoticeData | null;
  /** Retry affordance for a transient bulk failure (re-runs the bulk action). */
  onBulkRetry?: () => void;
  quota: QuotaStatus | null;
  staleNotice: boolean;
  replaceNotice: MutationNoticeData | null;
  /** Retry affordance for a transient commit failure (re-sends the staged set). */
  onReplaceRetry?: () => void;
}>) {
  return (
    <>
      {bulkNotice && !staleNotice ? (
        <MutationNotice notice={bulkNotice} onRetry={onBulkRetry} />
      ) : null}
      {quota?.overLimit ? (
        <Alert tone="warning">
          You&apos;ve selected {quota.staged} pages — your plan allows {quota.limit}. Remove{' '}
          {quota.staged - quota.limit} to continue.
        </Alert>
      ) : null}
      {staleNotice ? (
        <Alert tone="info">
          The monitored set changed since you started. We merged your edits onto the latest version
          — review and resubmit.
        </Alert>
      ) : null}
      {replaceNotice && !staleNotice ? (
        <MutationNotice notice={replaceNotice} onRetry={onReplaceRetry} />
      ) : null}
    </>
  );
}
