import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import type { Visibility } from '@citeladder/contracts';
import { isMetricsPending } from '@/lib/api/visibility-queries';
import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { BusyRung } from '@/components/ui/rung-meter';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock, screenState } from '@/components/ui/state-block';

/**
 * A projection that names a measured run. A range counts only when it lists
 * the runs it pooled: without them the tabs' reads would have no run set to
 * scope to.
 */
function isMeasured(data: Visibility | null): data is Visibility {
  if (data === null) return false;
  if (data.selection_mode !== 'range') return true;
  return (data.source_audit_ids?.length ?? 0) > 0;
}

/**
 * The selection's projection, before any Visibility tab reads from it.
 *
 * Every tab's own reads wait on the run this projection resolves, so until it
 * answers they are disabled with no data. A tab that consulted only its own
 * query reported that as a finding ("No answers named you", "No sources were
 * used") about a selection nobody had read (invariant 7). Five answers are
 * kept apart here, once, for every tab: still loading, a failed read with
 * Retry, metrics still being written for a run that finished, nothing measured
 * in the selection, and a measured run, which is the only one that reaches
 * the tab.
 */
export function SelectionGate({
  query,
  pending,
  children,
}: Readonly<{
  query: UseQueryResult<Visibility | null, unknown>;
  /** The loaded view's footprint while the read is pending; key figures by default. */
  pending?: ReactNode;
  children: (selected: Visibility) => ReactNode;
}>) {
  if (query.isPending && pending) return pending;
  // Metrics not written yet is the normal state for the seconds after a run
  // ends; reporting it as an error told readers their results were lost.
  if (query.status === 'error' && isMetricsPending(query.error)) {
    return <Notice tone="info">Results for this run are still being prepared.</Notice>;
  }
  const state = screenState(query, {
    subject: 'the selected measurement',
    shape: { kind: 'figures' },
    hasMeasurement: isMeasured,
    notMeasured: {
      description: 'Results appear here once a run in this selection finishes measuring.',
    },
  });
  if (state.kind === 'state') return <StateBlock {...state.state} />;
  return children(state.data);
}

/**
 * One analysis tab's read under a measured selection: a failed read with
 * Retry, a skeleton until `ready` arrives (the gate above has settled, so no
 * data is the read still on its way, never an empty finding), then the view.
 */
export function AnalysisRead<T>({
  query,
  title,
  busyLabel,
  busy,
  ready,
  children,
}: Readonly<{
  query: RetryableRead;
  title: string;
  busyLabel: string;
  busy: boolean;
  ready: T | undefined;
  children: (ready: T) => ReactNode;
}>) {
  if (query.error)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title={title}
        fallback="Check your connection and try again."
      />
    );
  if (ready === undefined)
    return (
      <Stack gap="workspace" aria-busy>
        <Skeleton variant="list" />
        <Skeleton variant="chart" />
      </Stack>
    );
  return (
    <div className="relative">
      <BusyRung active={busy} label={busyLabel} />
      {children(ready)}
    </div>
  );
}
