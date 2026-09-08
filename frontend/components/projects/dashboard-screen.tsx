'use client';

import { useQuery } from '@tanstack/react-query';

import { TopInsights } from '@/components/intelligence/top-insights';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { CommandCenter, Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';

import { CommandCenterSkeleton } from './dashboard-primitives';
import {
  ActionsAndProof,
  DashboardActions,
  DashboardHeader,
  SummarySections,
} from './dashboard-sections';
import { useCommandCenterActions } from './use-command-center-actions';

export function DashboardScreen({
  onEditProject,
}: Readonly<{ onEditProject?: (project: Project) => void }> = {}) {
  const context = useProjectContext();
  const commandCenter = useQuery({
    queryKey: queryKeys.projects.commandCenter(context.activeProject?.id ?? ''),
    queryFn: ({ signal }) => projectsApi.getCommandCenter(context.activeProject!.id, { signal }),
    enabled: Boolean(context.activeProject),
  });

  if (context.isLoading || (context.activeProject && commandCenter.isLoading)) {
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <PageHeader />
        <CommandCenterSkeleton />
      </div>
    );
  }
  if (!context.activeProject) return <PageHeader />;
  if (commandCenter.isError || !commandCenter.data)
    return (
      <div className="grid gap-[var(--workspace-gap)]">
        <PageHeader />
        <LoadError onRetry={commandCenter.refetch} />
      </div>
    );

  return (
    <DashboardData
      key={`${context.activeProject.id}:${commandCenter.data.action_order_version}`}
      data={commandCenter.data}
      activeProject={context.activeProject}
      onEditProject={onEditProject}
    />
  );
}

function LoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <Alert tone="danger">
      The command center could not be loaded.{' '}
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </Alert>
  );
}

function DashboardData({
  data,
  activeProject,
  onEditProject,
}: Readonly<{
  data: CommandCenter;
  activeProject: Project;
  onEditProject?: (project: Project) => void;
}>) {
  const actions = useCommandCenterActions(data, activeProject);
  return (
    <div className="flex flex-col gap-[var(--page-section-gap)]">
      <div className="grid gap-[var(--workspace-gap)]" data-tour="command-center">
        <PageHeader
          actions={
            <DashboardActions
              data={data}
              activeProject={activeProject}
              onEditProject={onEditProject}
              downloading={actions.downloading}
              onDownload={actions.download}
            />
          }
        />
        <DashboardHeader data={data} activeProject={activeProject} />
        {actions.downloadError ? (
          <Alert tone="danger">The report could not be downloaded. Try again.</Alert>
        ) : null}
        {actions.reorderError ? (
          <Alert tone="warning">
            The shared action order changed. Review the refreshed order and try again.
          </Alert>
        ) : null}
        {data.stale ? (
          <Alert tone="warning">
            New evidence is available. Refresh the measurement before acting.
          </Alert>
        ) : null}
        <SummarySections data={data} />
        <ActionsAndProof
          data={data}
          actions={actions.actions}
          pending={actions.reorderPending}
          onMove={actions.move}
          downloading={actions.downloading}
          onDownload={actions.download}
        />
      </div>
      <TopInsights projectId={activeProject.id} />
    </div>
  );
}
