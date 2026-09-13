'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import type { AgentTaskRun, AgentTaskType } from '@/lib/api/agent';
import { agentApi } from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext } from '@/lib/project/project-context';

import { RunDetail, TaskForm, TaskHistory } from './growth-agent-workspace-view';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';

const ACTIVE_STATUSES = new Set(['queued', 'running']);

export type AgentRouteContext = {
  workspaceId: string;
  projectId: string;
  canonicalRoute: string;
  dateRange: { start: string; end: string } | null;
  filters: Readonly<Record<string, readonly string[]>>;
};

export function GrowthAgentWorkspace({
  initialTask = 'explain',
  initialObjective = '',
  routeContext,
}: Readonly<{
  initialTask?: AgentTaskType;
  initialObjective?: string;
  routeContext?: AgentRouteContext;
}>) {
  const queryClient = useQueryClient();
  const { activeProject, activeWorkspaceId, isLoading: projectLoading } = useProjectContext();
  const projectId = activeProject?.id ?? null;
  const [taskType, setTaskType] = useState(initialTask);
  const [objective, setObjective] = useState(initialObjective);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [cancelError, setCancelError] = useState('');
  const tasks = useTasksQuery(activeWorkspaceId, projectId);
  const resolvedRunId = selectedRunId ?? tasks.data?.[0]?.id ?? null;
  const task = useTaskQuery(activeWorkspaceId, projectId, resolvedRunId);
  const submit = useSubmitTask({
    projectId,
    workspaceId: activeWorkspaceId,
    taskType,
    objective,
    queryClient,
    setFormError,
    setObjective,
    setSelectedRunId,
  });
  const cancel = useCancelTask(activeWorkspaceId, queryClient, setCancelError);

  if (projectLoading) return <p className="text-muted text-sm">Loading project…</p>;
  if (!projectId)
    return <p className="text-muted text-sm">Create or select a project to use Growth Agent.</p>;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Stack
        gap="workspace"
        className="min-h-0 flex-1 content-start overflow-y-auto px-[var(--card-padding)] py-4"
      >
        <p className={textRole('meta', 'flex items-center gap-2')}>
          <ShieldCheck aria-hidden className="text-accent-text size-4 shrink-0" />
          <span className="min-w-0 truncate">
            Read-only project evidence{routeContext ? ` · ${routeContext.canonicalRoute}` : ''}
          </span>
        </p>
        <div className="grid gap-4">
          <TaskHistory runs={tasks.data} selectedId={resolvedRunId} onSelect={setSelectedRunId} />
          {tasks.isError ? (
            <Alert tone="danger">Task history could not be loaded. Refresh and try again.</Alert>
          ) : (
            <RunDetail
              run={task.data}
              loading={task.isLoading}
              error={task.isError}
              cancelError={cancelError}
              cancelling={cancel.isPending}
              onCancel={(run) => cancel.mutate(run)}
            />
          )}
        </div>
      </Stack>
      <TaskForm
        taskType={taskType}
        objective={objective}
        submitting={submit.isPending}
        error={formError}
        onTaskTypeChange={setTaskType}
        onObjectiveChange={setObjective}
        onSubmit={() => submit.mutate()}
      />
    </div>
  );
}

function useTasksQuery(workspaceId: string | null, projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.tasks(projectId ?? ''),
    queryFn: ({ signal }) => agentApi.listTasks(projectId!, { signal, workspaceId }),
    enabled: Boolean(projectId && workspaceId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((run) => ACTIVE_STATUSES.has(run.status)) ? 2_000 : false,
  });
}

function useTaskQuery(workspaceId: string | null, projectId: string | null, runId: string | null) {
  return useQuery({
    queryKey: queryKeys.agent.task(projectId ?? '', runId ?? ''),
    queryFn: ({ signal }) => agentApi.getTask(projectId!, runId!, { signal, workspaceId }),
    enabled: Boolean(projectId && runId && workspaceId),
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.has(query.state.data.status) ? 2_000 : false,
  });
}

function useSubmitTask({
  projectId,
  workspaceId,
  taskType,
  objective,
  queryClient,
  setFormError,
  setObjective,
  setSelectedRunId,
}: Readonly<{
  projectId: string | null;
  workspaceId: string | null;
  taskType: AgentTaskType;
  objective: string;
  queryClient: ReturnType<typeof useQueryClient>;
  setFormError: (error: string) => void;
  setObjective: (objective: string) => void;
  setSelectedRunId: (id: string) => void;
}>) {
  return useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('Select a project before starting a task.');
      const nextObjective = objective.trim();
      if (!nextObjective) throw new Error('Write an objective for the task.');
      return agentApi.submitTask(
        { project_id: projectId, task_type: taskType, objective: nextObjective },
        crypto.randomUUID(),
        { workspaceId },
      );
    },
    onSuccess: (run) => {
      setFormError('');
      setObjective('');
      setSelectedRunId(run.id);
      queryClient.setQueryData(queryKeys.agent.task(run.project_id, run.id), run);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.tasks(run.project_id) });
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : 'The task could not be started.'),
  });
}

function useCancelTask(
  workspaceId: string | null,
  queryClient: ReturnType<typeof useQueryClient>,
  setCancelError: (error: string) => void,
) {
  return useMutation({
    mutationFn: (run: AgentTaskRun) => {
      setCancelError('');
      return agentApi.cancel(run.project_id, run.id, { workspaceId });
    },
    onSuccess: (run) => {
      setCancelError('');
      queryClient.setQueryData(queryKeys.agent.task(run.project_id, run.id), run);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.tasks(run.project_id) });
    },
    onError: (error) =>
      setCancelError(error instanceof Error ? error.message : 'The task could not be cancelled.'),
  });
}
