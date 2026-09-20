/** Client for the two bounded Growth Agent tasks. */
import { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import { agentTaskRunSchema, agentTaskRunSummarySchema, agentTaskTypeSchema } from './schemas';
import { strictValidate } from './schemas/validation';

export { agentTaskRunSchema } from './schemas';
export type AgentTaskType = z.infer<typeof agentTaskTypeSchema>;
export type AgentTaskRunSummary = z.infer<typeof agentTaskRunSummarySchema>;
export type AgentTaskRun = z.infer<typeof agentTaskRunSchema>;

export type AgentTaskInput = {
  project_id: string;
  task_type: AgentTaskType;
  objective: string;
};

export const agentApi = {
  listTasks: async (projectId: string, options?: ApiRequestOptions) =>
    strictValidate(
      z.array(agentTaskRunSummarySchema),
      await apiClient.get<unknown>(
        `/agent/tasks?project_id=${encodeURIComponent(projectId)}`,
        options,
      ),
      'agent.listTasks',
    ),
  getTask: async (projectId: string, runId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentTaskRunSchema,
      await apiClient.get<unknown>(
        `/agent/tasks/${encodeURIComponent(runId)}?project_id=${encodeURIComponent(projectId)}`,
        options,
      ),
      'agent.getTask',
    ),
  submitTask: async (input: AgentTaskInput, idempotencyKey: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentTaskRunSchema,
      await apiClient.post<unknown>('/agent/tasks', input, { ...options, idempotencyKey }),
      'agent.submitTask',
    ),
  cancel: async (projectId: string, runId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentTaskRunSchema,
      await apiClient.post<unknown>(
        `/agent/tasks/${encodeURIComponent(runId)}/cancel?project_id=${encodeURIComponent(projectId)}`,
        undefined,
        options,
      ),
      'agent.cancel',
    ),
};
