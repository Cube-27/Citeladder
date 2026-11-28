import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { CircleStop, RotateCcw } from '@/lib/icons';
import { useEngineCatalog } from '@/lib/providers/engines';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Inline } from '@/components/ui/layout';
import { ProgressMeter } from '@/components/ui/progress-meter';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { runsApi } from '@/lib/api/runs';
import type { Audit } from '@citeladder/contracts';
import { saveBlob } from '@/lib/download';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayTimestamp } from '@/lib/format';
import { AUDIT_STATES } from '@/lib/runs/status';
import { Notice } from '@/components/ui/notice';
import { ExportAction } from '@/components/ui/export-action';
import { Text } from '@/components/ui/typography';

export function RunActions({
  audit,
  cancelPending,
  onCancel,
  onRerunFailures,
  rerunPending = false,
}: Readonly<{
  audit: Audit;
  cancelPending: boolean;
  onCancel?: () => void;
  onRerunFailures?: () => void;
  rerunPending?: boolean;
}>) {
  const { cancelable } = audit;
  return (
    <>
      <ExportAction
        scope="page"
        formats={['csv', 'md']}
        onExport={async (format) => {
          const blob = await runsApi.downloadExport(audit.id, format, {
            workspaceId: audit.workspace_id,
          });
          saveBlob(blob, `audit-${audit.id}.${format}`);
        }}
      />
      {onCancel && (cancelable || cancelPending) ? (
        <Button variant="danger" onClick={onCancel} disabled={cancelPending}>
          <Icon icon={CircleStop} />
          {cancelPending ? 'Cancelling…' : 'Cancel run'}
        </Button>
      ) : null}
      {audit.failed_count > 0 && onRerunFailures ? (
        <MastheadPrimary>
          <Button variant="primary" onClick={onRerunFailures} disabled={rerunPending}>
            <Icon icon={RotateCcw} />
            {rerunPending ? 'Creating repair…' : 'Rerun failed'}
          </Button>
        </MastheadPrimary>
      ) : null}
    </>
  );
}

export function ProgressSkeleton() {
  return <Skeleton variant="text" lines={1} label="Loading run" />;
}

const RUN_COUNTS = [
  { label: 'requested', count: (audit: Audit) => audit.requested_count },
  { label: 'completed', count: (audit: Audit) => audit.completed_count },
  { label: 'failed', count: (audit: Audit) => audit.failed_count },
] as const;

function RunLine({ audit }: Readonly<{ audit: Audit }>) {
  const engines = useEngineCatalog();
  const timeZone = useDisplayTimeZone();
  const finished = audit.completed_count + audit.failed_count;
  const percent =
    audit.requested_count > 0
      ? Math.min(100, Math.round((finished / audit.requested_count) * 100))
      : 0;
  const running = AUDIT_STATES[audit.status].active && audit.requested_count > 0;
  return (
    <Inline wrap gap="group">
      <StatusMark variant="run-status" value={AUDIT_STATES[audit.status].badge}>
        {AUDIT_STATES[audit.status].label}
      </StatusMark>
      <Text variant="body" tone="ink-2" numeric>
        {RUN_COUNTS.map(({ label, count }) => `${formatCount(count(audit))} ${label}`).join(' · ')}
      </Text>
      {audit.not_applicable_engines.length ? (
        <Tag>
          Not available in this market: {audit.not_applicable_engines.map(engines.label).join(', ')}
        </Tag>
      ) : null}
      {running ? (
        <Inline box="fill">
          <ProgressMeter label="Progress" value={percent} />
        </Inline>
      ) : null}
      <Inline box="end">
        <Text variant="body" tone="ink-2" numeric>
          Started {formatDisplayTimestamp(audit.created_at, timeZone)}
        </Text>
      </Inline>
    </Inline>
  );
}

function ProgressNotices({
  errorMessage,
  cancelNotice,
  onCancelRetry,
  rerunNotice,
  onRerunRetry,
}: Readonly<{
  errorMessage?: string | null;
  cancelNotice?: MutationNoticeData | null;
  onCancelRetry?: () => void;
  rerunNotice?: MutationNoticeData | null;
  onRerunRetry?: () => void;
}>) {
  return (
    <>
      {errorMessage ? <Notice tone="negative">{errorMessage}</Notice> : null}
      {cancelNotice ? (
        <Notice kind="mutation" notice={cancelNotice} onRetry={onCancelRetry} />
      ) : null}
      {rerunNotice ? <Notice kind="mutation" notice={rerunNotice} onRetry={onRerunRetry} /> : null}
    </>
  );
}

export function ProgressPanel({
  audit,
  cancelNotice,
  onCancelRetry,
  rerunNotice,
  onRerunRetry,
}: Readonly<{
  audit: Audit;
  cancelNotice?: MutationNoticeData | null;
  onCancelRetry?: () => void;
  rerunNotice?: MutationNoticeData | null;
  onRerunRetry?: () => void;
}>) {
  return (
    <>
      <RunLine audit={audit} />
      <ProgressNotices
        errorMessage={audit.error_message}
        cancelNotice={cancelNotice}
        onCancelRetry={onCancelRetry}
        rerunNotice={rerunNotice}
        onRerunRetry={onRerunRetry}
      />
    </>
  );
}
