import type { ReactNode } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { CircleStop, RotateCcw } from '@/lib/icons';
import { useEngineCatalog } from '@/lib/providers/engines';
import { marketLabel } from '@citeladder/contracts/markets';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Inline, Stack } from '@/components/ui/layout';
import { Spinner } from '@/components/ui/spinner';
import { ProgressMeter } from '@/components/ui/progress-meter';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { runsApi } from '@/lib/api/runs';
import type { Audit } from '@citeladder/contracts';
import { saveBlob } from '@/lib/download';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayTime } from '@/lib/format';
import { AUDIT_STATES } from '@/lib/runs/status';
import { Notice } from '@/components/ui/notice';
import { FigureStrip } from '@/components/ui/figure-strip';
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
  return (
    <FigureStrip
      label="Run figures"
      lead={<Skeleton variant="text" lines={1} label="Loading run" />}
      segments={RUN_FIGURES.map(({ key, label }) => ({ key, label, value: null, loading: true }))}
    />
  );
}

function ProgressStatus({ audit, polling }: Readonly<{ audit: Audit; polling: boolean }>) {
  const engines = useEngineCatalog();
  const timeZone = useDisplayTimeZone();
  return (
    <Inline wrap>
      <Text variant="body" tone="ink-2">
        Started {formatDisplayTime(audit.created_at, timeZone)}
      </Text>
      <StatusMark variant="run-status" value={AUDIT_STATES[audit.status].badge}>
        {AUDIT_STATES[audit.status].label}
      </StatusMark>
      <Tag>{marketLabel(audit.market)}</Tag>
      {audit.not_applicable_engines.length ? (
        <Tag>
          Not available in this market: {audit.not_applicable_engines.map(engines.label).join(', ')}
        </Tag>
      ) : null}
      {polling ? <Spinner label="Updating…" showLabel /> : null}
    </Inline>
  );
}

function RunProgress({
  requested,
  finished,
}: Readonly<{
  requested: number;
  finished: number;
}>) {
  const percent = requested > 0 ? Math.min(100, Math.round((finished / requested) * 100)) : 0;

  return <ProgressMeter label="Progress" value={percent} />;
}

const RUN_FIGURES = [
  { key: 'requested', label: 'Requested', count: (audit: Audit) => audit.requested_count },
  { key: 'completed', label: 'Completed', count: (audit: Audit) => audit.completed_count },
  { key: 'failed', label: 'Failed', count: (audit: Audit) => audit.failed_count },
] as const;

function ProgressMetrics({ audit, lead }: Readonly<{ audit: Audit; lead: ReactNode }>) {
  return (
    <FigureStrip
      label="Run figures"
      lead={lead}
      segments={RUN_FIGURES.map(({ key, label, count }) => ({
        key,
        label,
        value: formatCount(count(audit)),
      }))}
    />
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
  const polling = AUDIT_STATES[audit.status].active;

  return (
    <>
      <ProgressMetrics
        audit={audit}
        lead={
          <Stack>
            <ProgressStatus audit={audit} polling={polling} />
            {polling && audit.requested_count > 0 ? (
              <RunProgress
                requested={audit.requested_count}
                finished={audit.completed_count + audit.failed_count}
              />
            ) : null}
          </Stack>
        }
      />
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
