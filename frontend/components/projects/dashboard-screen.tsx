'use client';

import { useQuery } from '@tanstack/react-query';

import { TopInsights } from '@/components/intelligence/top-insights';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { splitPaneClasses } from '@/components/ui/workspace';
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

const DASHBOARD_METRIC_PLACEHOLDERS = ['metric-a', 'metric-b', 'metric-c'] as const;
const DASHBOARD_ACTION_PLACEHOLDERS = ['action-a', 'action-b', 'action-c'] as const;

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
  if (!context.activeProject) return <PageShell />;
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
    <PageShell actions={<Skeleton className="h-8 w-44 rounded-[var(--radius-control)]" />}>
      <Stack gap="section" aria-busy="true">
        <Stack gap="workspace">
          <output className="sr-only">Loading your command center…</output>

          <div className="flex min-w-0 items-center gap-4">
            <Skeleton className="size-12 shrink-0 rounded-[var(--radius-control)]" />
            <div className="grid min-w-0 flex-1 gap-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>

          <div className={splitPaneClasses('main-aside')}>
            <Card className="grid content-start gap-3 p-[var(--card-padding)]">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-24 rounded-xs" />
              </div>
              <div className="divide-border-subtle grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {DASHBOARD_METRIC_PLACEHOLDERS.map((placeholder) => (
                  <div key={placeholder} className="grid gap-2 py-3 sm:px-4 sm:first:ps-0">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="flex flex-col justify-between gap-4 p-[var(--card-padding)]">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-8 w-24 justify-self-end rounded-[var(--radius-control)]" />
            </Card>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>

          <Card tone="recommendation" className="grid gap-4 p-[var(--card-padding)]">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-24 rounded-[var(--radius-control)]" />
          </Card>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="h-8 w-20 rounded-[var(--radius-control)]" />
            </div>
            <div className="divide-border-subtle grid divide-y">
              {DASHBOARD_ACTION_PLACEHOLDERS.map((placeholder) => (
                <div key={placeholder} className="grid gap-2 py-3">
                  <Skeleton className="h-5 w-3/5" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        </Stack>

        <div className="grid gap-3">
          <Skeleton className="h-5 w-28" />
          <div className="grid gap-4 sm:grid-cols-3">
            {DASHBOARD_METRIC_PLACEHOLDERS.map((placeholder) => (
              <div key={placeholder} className="grid gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        </div>
      </Stack>
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
        <Stack gap="section" data-tour="command-center">
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
          />
        </Stack>
        <TopInsights workspaceId={activeProject.workspace_id} projectId={activeProject.id} />
        <CompanyFacts data={data} />
      </Stack>
    </PageShell>
  );
}
