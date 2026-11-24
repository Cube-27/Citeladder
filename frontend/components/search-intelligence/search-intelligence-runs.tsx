import { Button } from '@/components/ui/button';
import type { SearchIntelligenceRun } from '@/lib/api/search-intelligence';
import { formatCount, pluralCount } from '@/lib/format';
import { SEARCH_RUN_STATES } from '@/lib/search-intelligence/status';
import { Notice } from '@/components/ui/notice';
import { countMeter, WorkProgress } from '@/components/ui/work-progress';

const STOP_REASONS: Readonly<Record<string, string>> = {
  cost_ceiling_reached:
    'The next request could have cost more than the estimate you confirmed, so it was not sent.',
  cost_ceiling_exceeded:
    'DataForSEO charged more than the estimate, so the remaining requests stopped.',
  auth_failure: 'DataForSEO refused the saved credential. Update it in provider settings.',
  client_error:
    'The DataForSEO connection settings are not valid. Check them in provider settings.',
  connection_changed: 'The DataForSEO connection changed after review. Review the analysis again.',
  pricing_changed: 'DataForSEO pricing changed after review. Review the analysis again.',
  provider_result_missing:
    'A request was sent but its result never arrived. It may have been charged; it is never resent automatically.',
  provider_cost_unavailable:
    'DataForSEO did not report what a request cost, so the analysis stopped.',
  provider_scope_violation:
    'DataForSEO returned results outside the reviewed website, so they were not saved.',
  acquisition_queue_terminal: 'The analysis stopped before every request finished.',
};

export function RunNotice({
  run,
  onCancel,
  onReview,
  cancelling,
}: Readonly<{
  run: SearchIntelligenceRun | null;
  onCancel?: (runId: string) => void;
  onReview?: () => void;
  cancelling: boolean;
}>) {
  if (!run) return null;
  if (SEARCH_RUN_STATES[run.status].active)
    return (
      <WorkProgress
        label="Analysis progress"
        narration={
          run.status === 'queued'
            ? 'Waiting to start the analysis'
            : 'Fetching search data from DataForSEO'
        }
        meter={countMeter({
          done: run.completed_calls,
          total: run.planned_calls,
          label: `${formatCount(run.completed_calls)} of ${pluralCount(run.planned_calls, 'request')} complete`,
        })}
        action={
          onCancel ? (
            <Button variant="secondary" disabled={cancelling} onClick={() => onCancel(run.id)}>
              Cancel
            </Button>
          ) : undefined
        }
      />
    );
  if (!['partial', 'failed', 'uncertain'].includes(run.status)) return null;
  const reason =
    STOP_REASONS[run.error_code] ||
    run.error_detail ||
    `${run.completed_calls} of ${run.planned_calls} requests completed.`;
  return (
    <Notice
      tone="warning"
      standing
      action={
        onReview ? (
          <Button type="button" variant="secondary" onClick={onReview}>
            Review again
          </Button>
        ) : undefined
      }
    >
      {`Analysis ${SEARCH_RUN_STATES[run.status].label.toLowerCase()}. ${reason} Saved results remain available below.`}
    </Notice>
  );
}
