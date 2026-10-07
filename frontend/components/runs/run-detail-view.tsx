import { ProjectLink } from '@/components/layout/scoped-link';

import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { ExecutionsTable } from '@/components/runs/executions-table';
import { ProgressPanel } from '@/components/runs/progress-panel';
import { PageLoading } from '@/components/layout/page-loading';
import { ICONS } from '@/lib/icons';
import type { MutationNotice } from '@/lib/api/mutation-notice';
import type { Audit, Execution } from '@/lib/api/types';

type RunDetailViewProps = {
  audit: Audit | undefined;
  auditLoading: boolean;
  auditError: unknown;
  auditRetrying: boolean;
  onRetryAudit: () => void;
  executions: Execution[] | undefined;
  executionsLoading: boolean;
  executionsError: boolean;
  exportError: string | null;
  cancelNotice: MutationNotice | null;
  rerunNotice: MutationNotice | null;
  onCancel: () => void;
  onRerunFailures: () => void;
  onSelectEvidence: (execution: Execution) => void;
};

function AuditSection({
  audit,
  auditLoading,
  auditError,
  auditRetrying,
  onRetryAudit,
  exportError,
  cancelNotice,
  rerunNotice,
  onCancel,
  onRerunFailures,
}: RunDetailViewProps) {
  if (auditError && !audit) {
    return (
      <ReadError
        error={auditError}
        fallback="Something went wrong. Please try again."
        onRetry={onRetryAudit}
        pending={auditRetrying}
      />
    );
  }
  if (auditLoading || !audit) {
    return <PageLoading label="Loading run…" />;
  }
  return (
    <ProgressPanel
      audit={audit}
      exportError={exportError}
      cancelNotice={cancelNotice}
      onCancelRetry={onCancel}
      rerunNotice={rerunNotice}
      onRerunRetry={onRerunFailures}
    />
  );
}

function ExecutionsSection({
  executions,
  executionsLoading,
  executionsError,
  onSelectEvidence,
}: Pick<
  RunDetailViewProps,
  'executions' | 'executionsLoading' | 'executionsError' | 'onSelectEvidence'
>) {
  if (executionsError && !executions)
    return <Alert tone="danger">Could not load executions.</Alert>;
  if (executionsLoading || !executions) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (executions.length === 0) {
    return (
      <EmptyState
        variant="compact"
        headingLevel={3}
        icon={ICONS.runs}
        heading="No executions yet."
        description="They appear as the run is planned and processed."
      />
    );
  }
  return (
    <Card>
      <CardContent flush>
        <ExecutionsTable executions={executions} onSelectEvidence={onSelectEvidence} />
      </CardContent>
    </Card>
  );
}

export function RunDetailView(props: RunDetailViewProps) {
  return (
    <Stack gap="workspace">
      <ProjectLink
        href="/runs"
        projectId={props.audit?.project_id}
        className={textRole('label', 'text-accent-text hover:underline')}
      >
        ← Back to runs
      </ProjectLink>
      <AuditSection {...props} />
      <Stack gap="compact">
        <EditorialSectionHeader title="Executions" />
        <ExecutionsSection {...props} />
      </Stack>
    </Stack>
  );
}
