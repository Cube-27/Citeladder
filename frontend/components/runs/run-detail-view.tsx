import { ExecutionsTable } from '@/components/runs/executions-table';
import { ProgressPanel, ProgressSkeleton } from '@/components/runs/progress-panel';
import { ICONS } from '@/lib/icons';
import type { MutationNotice } from '@/lib/api/mutation-notice';
import type { Audit, Execution } from '@citeladder/contracts';
import { readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { queryTableState, StateBlock } from '@/components/ui/state-block';

type RunDetailViewProps = {
  audit: Audit | undefined;
  auditLoading: boolean;
  auditRead: RetryableRead;
  executions: Execution[] | undefined;
  executionsRead: RetryableRead;
  cancelNotice: MutationNotice | null;
  rerunNotice: MutationNotice | null;
  onCancel: () => void;
  onRerunFailures: () => void;
  onSelectEvidence: (execution: Execution) => void;
};

function AuditSection({
  audit,
  auditLoading,
  auditRead,
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
        title="Couldn't load this run"
        fallback="The request failed or timed out."
      />
    );
  }
  if (auditLoading || !audit) return <ProgressSkeleton />;
  return (
    <ProgressPanel
      audit={audit}
      cancelNotice={cancelNotice}
      onCancelRetry={onCancel}
      rerunNotice={rerunNotice}
      onRerunRetry={onRerunFailures}
    />
  );
}

function executionsState({
  executions,
  executionsRead,
}: Pick<RunDetailViewProps, 'executions' | 'executionsRead'>) {
  return queryTableState(
    { ...executionsRead, isError: Boolean(executionsRead.error), data: executions },
    {
      subject: 'the executions',
      empty: (rows) =>
        rows.length === 0
          ? { kind: 'empty', headingLevel: 3, icon: ICONS.runs, heading: 'No executions yet' }
          : undefined,
    },
  );
}

export function RunDetailView(props: Readonly<RunDetailViewProps>) {
  if (props.auditRead.error && !props.audit && !props.executions)
    return <AuditSection {...props} />;
  if (!props.audit && !props.auditRead.error) return <AuditSection {...props} />;
  return (
    <>
      <AuditSection {...props} />
      <ExecutionsTable
        executions={props.executions ?? []}
        {...executionsState(props)}
        onSelectEvidence={props.onSelectEvidence}
      />
    </>
  );
}
