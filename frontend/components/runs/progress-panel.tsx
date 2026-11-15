import { useState, type ReactNode } from 'react';

import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { MeasurementContext } from '@/components/runs/measurement-context';
import { useEngineCatalog } from '@/lib/providers/engines';
import { marketLabel } from '@citeladder/contracts/markets';
import { Button } from '@/components/ui/button';
import { Inline, Stack } from '@/components/ui/layout';
import { Spinner } from '@/components/ui/spinner';
import { RungMeter } from '@/components/ui/rung-meter';
import { humanizeApiError } from '@/lib/api/errors';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { runsApi } from '@/lib/api/runs';
import type { Audit } from '@citeladder/contracts';
import { saveBlob } from '@/lib/download';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayTimestamp } from '@/lib/format';
import { AUDIT_STATES } from '@/lib/runs/status';
import { Notice } from '@/components/ui/notice';
import { FigureStrip } from '@/components/ui/figure-strip';

type ExportFormat = 'csv' | 'md';

/**
 * Authenticated CSV/MD export state for one run. Exports use the audit's
 * persisted workspace identity rather than a headerless navigation that could
 * resolve another workspace. The route owns this so its actions can live in the
 * page's identity band while the panel still reports an export failure.
 */
export function useRunExport(audit: Audit | undefined) {
  // The route stays mounted across runs (a repair run is a navigation, not a
  // remount), so each state belongs to the run it was started for and is ignored
  // once the reader is looking at another one.
  const [exporting, setExporting] = useState<{ auditId: string; format: ExportFormat } | null>(
    null,
  );
  const [exportError, setExportError] = useState<{ auditId: string; message: string } | null>(null);

  async function download(format: ExportFormat) {
    if (!audit) return;
    const auditId = audit.id;
    setExporting({ auditId, format });
    setExportError(null);
    try {
      const blob = await runsApi.downloadExport(auditId, format, {
        workspaceId: audit.workspace_id,
      });
      saveBlob(blob, `audit-${auditId}.${format}`);
    } catch (error) {
      setExportError({ auditId, message: humanizeApiError(error).message });
    } finally {
      setExporting((current) => (current?.auditId === auditId ? null : current));
    }
  }

  const current = audit?.id;
  return {
    exporting: exporting && exporting.auditId === current ? exporting.format : null,
    exportError: exportError && exportError.auditId === current ? exportError.message : null,
    onExport: (format: ExportFormat) => void download(format),
  };
}

/**
 * The run's actions: exports, a Cancel offered only while the backend still
 * accepts a cooperative cancel (i.e. not `reporting`/terminal), and a failure
 * rerun when something failed. Rendered in the route's identity band.
 */
export function RunActions({
  audit,
  cancelPending,
  onCancel,
  onRerunFailures,
  rerunPending = false,
  onExport,
  exporting,
}: Readonly<{
  audit: Audit;
  cancelPending: boolean;
  /** Cancel and rerun are offered only to a role that may run audits. */
  onCancel?: () => void;
  onRerunFailures?: () => void;
  rerunPending?: boolean;
  onExport: (format: ExportFormat) => void;
  exporting: ExportFormat | null;
}>) {
  const { cancelable } = audit;
  return (
    <>
      <Button variant="secondary" onClick={() => onExport('csv')} disabled={exporting !== null}>
        {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
      </Button>
      <Button variant="secondary" onClick={() => onExport('md')} disabled={exporting !== null}>
        {exporting === 'md' ? 'Exporting…' : 'Export MD'}
      </Button>
      {onCancel && (cancelable || cancelPending) ? (
        <Button variant="danger" onClick={onCancel} disabled={cancelPending}>
          {cancelPending ? 'Cancelling…' : 'Cancel run'}
        </Button>
      ) : null}
      {audit.failed_count > 0 && onRerunFailures ? (
        <Button variant="secondary" onClick={onRerunFailures} disabled={rerunPending}>
          {rerunPending ? 'Creating repair…' : 'Rerun failed'}
        </Button>
      ) : null}
    </>
  );
}

function ProgressStatus({ audit, polling }: Readonly<{ audit: Audit; polling: boolean }>) {
  const engines = useEngineCatalog();
  const timeZone = useDisplayTimeZone();
  return (
    <Inline className="flex-wrap">
      {/* A date is recorded, not a figure: it reads in the status line. */}
      <span className="type-data text-ink-2">
        Created {formatDisplayTimestamp(audit.created_at, timeZone)}
      </span>
      <StatusMark variant="run-status" value={AUDIT_STATES[audit.status].badge}>
        {AUDIT_STATES[audit.status].label}
      </StatusMark>
      <Tag>{marketLabel(audit.market)}</Tag>
      <MeasurementContext provenance={audit.model_provenance} />
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
  /** Answers that reached an outcome, failed ones included: a failure is no longer pending. */
  finished: number;
}>) {
  const percent = requested > 0 ? Math.min(100, Math.round((finished / requested) * 100)) : 0;

  return <RungMeter label="Progress" value={percent} />;
}

function ProgressMetrics({ audit, lead }: Readonly<{ audit: Audit; lead: ReactNode }>) {
  return (
    <FigureStrip
      label="Run figures"
      lead={lead}
      segments={[
        { key: 'requested', label: 'Requested', value: formatCount(audit.requested_count) },
        { key: 'completed', label: 'Completed', value: formatCount(audit.completed_count) },
        { key: 'failed', label: 'Failed', value: formatCount(audit.failed_count) },
      ]}
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

/**
 * Run progress panel (F10).
 *
 * Shows the audit's status badge, the requested/completed/failed counts, the
 * created timestamp, and the outcome of the run's actions (export, cancel and
 * rerun failures). The actions themselves are `RunActions`, rendered by the
 * route in its identity band. Progress is driven by the parent's polling of
 * `GET /audits/{id}`.
 */
export function ProgressPanel({
  audit,
  title,
  exportError,
  cancelNotice,
  onCancelRetry,
  rerunNotice,
  onRerunRetry,
}: Readonly<{
  audit: Audit;
  /** The run's name, read in full where the masthead cuts it. */
  title?: string;
  /** A failed export from `useRunExport`. */
  exportError?: string | null;
  /** The A4 mutation notice for a failed cancel (verbatim 4xx, transient retry). */
  cancelNotice?: MutationNoticeData | null;
  /** Retry affordance for a transient cancel failure. */
  onCancelRetry?: () => void;
  rerunNotice?: MutationNoticeData | null;
  onRerunRetry?: () => void;
}>) {
  const polling = AUDIT_STATES[audit.status].active;

  return (
    <Stack gap="workspace">
      <ProgressMetrics
        audit={audit}
        lead={
          <Stack>
            {title ? (
              // Below the shell width the masthead cuts the title; it reads here in full.
              <p className="type-heading desktop:hidden">{title}</p>
            ) : null}
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
        errorMessage={exportError ?? audit.error_message}
        cancelNotice={cancelNotice}
        onCancelRetry={onCancelRetry}
        rerunNotice={rerunNotice}
        onRerunRetry={onRerunRetry}
      />
    </Stack>
  );
}
