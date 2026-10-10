'use client';

import { useQuery } from '@tanstack/react-query';

import { PageLoading } from '@/components/layout/page-loading';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Stack } from '@/components/ui/layout';
import { ProjectRequiredState } from '@/components/layout/project-required-state';
import { ReadError } from '@/components/ui/read-error';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { CommandCenter, Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';

import {
  ActionsAndProof,
  CompanyFacts,
  DashboardActions,
  DashboardHeader,
  SummarySections,
} from './dashboard-sections';
import { PromptSetupCard } from './prompt-setup-card';
import { useCommandCenterActions } from './use-command-center-actions';

export function DashboardScreen({
  onEditProject,
}: Readonly<{ onEditProject?: (project: Project) => void }> = {}) {
  const context = useProjectContext();
  const commandCenter = useQuery({
    queryKey: queryKeys.projects.commandCenter(context.activeProject?.id ?? ''),
    queryFn: ({ signal }) =>
      projectsApi.getCommandCenter(context.activeProject!.id, {
        signal,
        workspaceId: context.activeProject!.workspace_id,
      }),
    enabled: Boolean(context.activeProject),
  });

  if (context.isLoading || (context.activeProject && commandCenter.isLoading)) {
    return <DashboardLoading />;
  }
  if (!context.activeProject)
    return (
      <PageShell>
        <ProjectRequiredState />
      </PageShell>
    );
  if (commandCenter.isError || !commandCenter.data)
    return (
      <PageShell>
        <ReadError
          error={commandCenter.error}
          fallback="The command center could not be loaded."
          onRetry={() => void commandCenter.refetch()}
          pending={commandCenter.isFetching}
        />
      </PageShell>
    );

  return (
    <DashboardData
      key={context.activeProject.id}
      data={commandCenter.data}
      activeProject={context.activeProject}
      onEditProject={onEditProject}
    />
  );
}

function DashboardLoading() {
  return (
    <PageShell>
      <PageLoading label="Loading your command center…" />
    </PageShell>
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
    <PageShell
      actions={
        <DashboardActions
          data={data}
          activeProject={activeProject}
          onEditProject={onEditProject}
          downloading={actions.downloading}
          onDownload={actions.download}
        />
      }
    >
      <Stack gap="section">
        <Stack gap="section">
          <DashboardHeader data={data} activeProject={activeProject} />
          {data.active_prompt_count === 0 ? <PromptSetupCard /> : null}
          {actions.downloadError ? (
            <Alert tone="danger">The report could not be downloaded. Try again.</Alert>
          ) : null}
          {actions.reorderError ? (
            <Alert tone="warning">
              The shared action order changed. Review the refreshed order and try again.
            </Alert>
          ) : null}
          <SummarySections data={data} />
          <ActionsAndProof
            data={data}
            actions={actions.actions}
            pending={actions.reorderPending}
            onMove={actions.move}
          />
        </Stack>
        <CompanyFacts data={data} />
      </Stack>
    </PageShell>
  );
}
