import type { DataTableState } from '@/components/ui/data-table';
import { ExecutionsTable } from '@/components/runs/executions-table';
import { ProgressPanel } from '@/components/runs/progress-panel';
import { ICONS } from '@/lib/icons';
import type { MutationNotice } from '@/lib/api/mutation-notice';
import type { Audit, Execution } from '@citeladder/contracts';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type RunDetailViewProps = {
  audit: Audit | undefined;
  /** The run's name, read in full where the masthead cuts it. */
  title?: string;
  auditLoading: boolean;
  /** The audit read: its failure, and the retry of exactly that read. */
  auditRead: RetryableRead;
  executions: Execution[] | undefined;
  executionsLoading: boolean;
  executionsRead: RetryableRead;
  exportError: string | null;
  cancelNotice: MutationNotice | null;
  rerunNotice: MutationNotice | null;
  onCancel: () => void;
  onRerunFailures: () => void;
  onSelectEvidence: (execution: Execution) => void;
};

function AuditSection({
  audit,
  title,
  auditLoading,
  auditRead,
  exportError,
  cancelNotice,
  rerunNotice,
  onCancel,
  onRerunFailures,
}: Readonly<RunDetailViewProps>) {
  if (auditRead.error && !audit) {
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(auditRead)}
        fallback="Something went wrong. Please try again."
      />
    );
  }
  if (auditLoading || !audit) {
    return <StateBlock kind="loading" label="Loading run…" />;
  }
  return (
    <ProgressPanel
      audit={audit}
      title={title}
      exportError={exportError}
      cancelNotice={cancelNotice}
      onCancelRetry={onCancel}
      rerunNotice={rerunNotice}
      onRerunRetry={onRerunFailures}
    />
  );
}

/** What the executions table shows instead of rows, if anything. */
function executionsState({
  executions,
  executionsLoading,
  executionsRead,
}: Pick<RunDetailViewProps, 'executions' | 'executionsLoading' | 'executionsRead'>):
  | DataTableState
  | undefined {
  if (executionsRead.error && !executions) {
    return {
      kind: 'error',
      ...readErrorProps(executionsRead),
      fallback: 'Could not load executions.',
    };
  }
  if (executionsLoading || !executions) return { kind: 'loading', label: 'Loading executions…' };
  if (executions.length === 0) {
    return {
      kind: 'empty',
      headingLevel: 3,
      icon: ICONS.runs,
      heading: 'No executions yet',
      description: 'They appear as the run is planned and processed.',
    };
  }
  return undefined;
}

export function RunDetailView(props: Readonly<RunDetailViewProps>) {
  return (
    <>
      <AuditSection {...props} />
      <ExecutionsTable
        executions={props.executions ?? []}
        state={executionsState(props)}
        onSelectEvidence={props.onSelectEvidence}
      />
    </>
  );
}
