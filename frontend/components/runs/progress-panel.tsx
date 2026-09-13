'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { MeasurementContext } from '@/components/runs/measurement-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { Label, Metric, textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { runsApi } from '@/lib/api/runs';
import type { Audit } from '@/lib/api/types';
import { saveBlob } from '@/lib/site-health/download';
import {
  auditBadgeValue,
  auditStatusLabel,
  formatDateTime,
  isAuditCancelable,
  shouldPollAudit,
} from '@/lib/runs/status';

function ProgressHeader({
  audit,
  polling,
  cancelable,
  cancelPending,
  onCancel,
  onRerunFailures,
  rerunPending,
  onExport,
  exporting,
}: Readonly<{
  audit: Audit;
  polling: boolean;
  cancelable: boolean;
  cancelPending: boolean;
  onCancel: () => void;
  onRerunFailures?: () => void;
  rerunPending: boolean;
  onExport: (format: 'csv' | 'md') => void;
  exporting: 'csv' | 'md' | null;
}>) {
  return (
    <div className="border-border-subtle flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant="run-status" value={auditBadgeValue(audit.status)}>
          {auditStatusLabel(audit.status)}
        </Badge>
        <MeasurementContext provenance={audit.model_provenance} />
        {polling ? (
          <span
            className="mono text-muted inline-flex items-center gap-1.5 text-xs"
            aria-live="polite"
          >
            <span className="activity-dot bg-accent inline-block size-1.5" aria-hidden />
            Updating…
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onExport('csv')}
          disabled={exporting !== null}
        >
          {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onExport('md')}
          disabled={exporting !== null}
        >
          {exporting === 'md' ? 'Exporting…' : 'Export MD'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onCancel}
          disabled={!cancelable || cancelPending}
        >
          {cancelPending ? 'Cancelling…' : 'Cancel run'}
        </Button>
        {audit.failed_count > 0 && onRerunFailures ? (
          <Button variant="secondary" size="sm" onClick={onRerunFailures} disabled={rerunPending}>
            {rerunPending ? 'Creating repair…' : 'Rerun failed'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({
  requested,
  completed,
}: Readonly<{
  requested: number;
  completed: number;
}>) {
  const percent = requested > 0 ? Math.min(100, Math.round((completed / requested) * 100)) : 0;

  return (
    <div className="grid gap-1">
      <div className="text-muted flex justify-between text-xs">
        <span>Progress</span>
        <span>{percent}%</span>
      </div>
      <div className="bg-well h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-accent h-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ProgressMetrics({ audit }: Readonly<{ audit: Audit }>) {
  const failedColor = audit.failed_count > 0 ? 'text-run-failed' : 'text-muted';

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="border-border-subtle grid gap-1 border-r pr-2 last:border-0 sm:pr-4">
        <Label>Requested</Label>
        <Metric>{audit.requested_count}</Metric>
      </div>
      <div className="border-border-subtle grid gap-1 border-r pr-2 last:border-0 sm:pr-4">
        <Label>Completed</Label>
        <Metric className="text-run-completed">{audit.completed_count}</Metric>
      </div>
      <div className="border-border-subtle grid gap-1 border-r pr-2 last:border-0 sm:pr-4">
        <Label>Failed</Label>
        <Metric className={failedColor}>{audit.failed_count}</Metric>
      </div>
      <div className="grid gap-1">
        <Label>Created</Label>
        <span className={textRole('bodyStrong')}>{formatDateTime(audit.created_at)}</span>
      </div>
    </dl>
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
      {errorMessage ? <p className="text-danger-text text-sm">{errorMessage}</p> : null}
      {cancelNotice ? <MutationNotice notice={cancelNotice} onRetry={onCancelRetry} /> : null}
      {rerunNotice ? <MutationNotice notice={rerunNotice} onRetry={onRerunRetry} /> : null}
    </>
  );
}

/**
 * Run progress panel (F10, design.md §9.7).
 *
 * Shows the audit's status badge, the requested/completed/failed mono counts,
 * the created + completed timestamps, a Cancel button (enabled only while the
 * backend still accepts a cooperative cancel — i.e. not `reporting`/terminal),
 * and authenticated CSV/MD exports. Progress is driven by the parent's polling
 * of `GET /audits/{id}`; exports use the audit's persisted workspace identity
 * rather than a headerless navigation that could resolve another workspace.
 */
export function ProgressPanel({
  audit,
  onCancel,
  cancelPending,
  cancelNotice,
  onCancelRetry,
  onRerunFailures,
  rerunPending = false,
  rerunNotice,
  onRerunRetry,
}: Readonly<{
  audit: Audit;
  onCancel: () => void;
  cancelPending: boolean;
  /** The A4 mutation notice for a failed cancel (verbatim 4xx, transient retry). */
  cancelNotice?: MutationNoticeData | null;
  /** Retry affordance for a transient cancel failure. */
  onCancelRetry?: () => void;
  onRerunFailures?: () => void;
  rerunPending?: boolean;
  rerunNotice?: MutationNoticeData | null;
  onRerunRetry?: () => void;
}>) {
  const polling = shouldPollAudit(audit.status);
  const cancelable = isAuditCancelable(audit.status);
  const [exporting, setExporting] = useState<'csv' | 'md' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function download(format: 'csv' | 'md') {
    setExporting(format);
    setExportError(null);
    try {
      const blob = await runsApi.downloadExport(audit.id, format, {
        workspaceId: audit.workspace_id,
      });
      saveBlob(blob, `audit-${audit.id}.${format}`);
    } catch (error) {
      setExportError(humanizeApiError(error).message);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        <ProgressHeader
          audit={audit}
          polling={polling}
          cancelable={cancelable}
          cancelPending={cancelPending}
          onCancel={onCancel}
          onRerunFailures={onRerunFailures}
          rerunPending={rerunPending}
          onExport={(format) => void download(format)}
          exporting={exporting}
        />

        {polling && audit.requested_count > 0 ? (
          <ProgressBar requested={audit.requested_count} completed={audit.completed_count} />
        ) : null}

        <ProgressMetrics audit={audit} />

        <ProgressNotices
          errorMessage={exportError ?? audit.error_message}
          cancelNotice={cancelNotice}
          onCancelRetry={onCancelRetry}
          rerunNotice={rerunNotice}
          onRerunRetry={onRerunRetry}
        />
      </CardContent>
    </Card>
  );
}
