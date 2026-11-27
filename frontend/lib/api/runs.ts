import { z } from 'zod';
import { mutationOptions, queryOptions, skipToken, type QueryClient } from '@tanstack/react-query';

import { API_BASE_URL } from '@/lib/config/operational';
import { TABLE_DEFAULT_PAGE_SIZE } from '@/lib/config/tables';
import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import type { ProjectScope } from './query-keys/scope';
import {
  auditEstimateSchema,
  auditPageSchema,
  auditScheduleSchema,
  auditSchema,
  type AuditListSort,
  type AuditPage,
  type AuditScope,
  executionEvidenceSchema,
  executionSchema,
} from '@citeladder/contracts/audits';
import type {
  AuditEstimateRequest,
  AuditLaunchRequest,
  AuditRepairRequest,
  AuditScheduleCreateRequest,
  AuditScheduleUpdateRequest,
} from '@citeladder/contracts/audit-requests';
import { strictValidate } from '@citeladder/contracts/validation';
import { definedQuery, withQuery } from './shared';
import { startInteractiveWork } from './interactive-work';
import type {
  Audit,
  AuditSchedule,
  AuditStatus,
  Execution,
  ExecutionEvidence,
  PromptAnswerSearch,
} from '@citeladder/contracts';
import {
  promptAnswerPageSchema,
  type PromptAnswerPage,
} from '@citeladder/contracts/visibility-prompt-answers';

export type RunsPageParams = Readonly<{
  audit_scope?: AuditScope;
  market?: string;
  status?: readonly AuditStatus[];
  completed_from?: string;
  completed_to?: string;
  sort?: AuditListSort;
  descending?: boolean;
  page?: number;
  page_size?: number;
}>;

export const RUNS_SCREEN_PARAMS: RunsPageParams = {
  status: [],
  sort: 'created',
  descending: true,
  page: 1,
  page_size: TABLE_DEFAULT_PAGE_SIZE,
};

export type PromptAnswerParams = Readonly<{
  market?: string;
  engine?: string;
  from?: string;
  brand?: string;
  cited?: boolean;
  search?: PromptAnswerSearch;
  cursor?: string;
  limit?: number;
}>;

const auditListSchema = z.array(auditSchema);
const executionListSchema = z.array(executionSchema);
const auditScheduleListSchema = z.array(auditScheduleSchema);

export const runsApi = {
  estimateAudit: async (input: AuditEstimateRequest, options?: ApiRequestOptions) => {
    const res = await apiClient.post('/audits/estimate', input, options);
    return strictValidate(auditEstimateSchema, res, 'runs.estimateAudit');
  },
  launchAudit: async (input: AuditLaunchRequest, options?: ApiRequestOptions) => {
    const res = await apiClient.post<Audit[]>('/audits', input, options);
    const audits = strictValidate(auditListSchema, res, 'runs.launchAudit');
    for (const audit of audits) startInteractiveWork(`/audits/${audit.id}/run`, options);
    return audits;
  },
  listAudits: async (scope: ProjectScope, params: RunsPageParams, options?: ApiRequestOptions) => {
    const path = withQuery('/audits', definedQuery({ project_id: scope.projectId, ...params }));
    const res = await apiClient.get<AuditPage>(path, options);
    return strictValidate(auditPageSchema, res, 'runs.listAudits');
  },
  getAudit: async (auditId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<Audit>(`/audits/${auditId}`, options);
    return strictValidate(auditSchema, res, 'runs.getAudit');
  },
  cancelAudit: async (auditId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<Audit>(`/audits/${auditId}/cancel`, undefined, options);
    return strictValidate(auditSchema, res, 'runs.cancelAudit');
  },
  rerunFailures: async (
    auditId: string,
    input: AuditRepairRequest = {},
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<Audit>(`/audits/${auditId}/rerun-failures`, input, options);
    const audit = strictValidate(auditSchema, res, 'runs.rerunFailures');
    startInteractiveWork(`/audits/${audit.id}/run`, options);
    return audit;
  },
  listSchedules: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<AuditSchedule[]>(
      `/projects/${projectId}/audit-schedules`,
      options,
    );
    return strictValidate(auditScheduleListSchema, res, 'runs.listSchedules');
  },
  createSchedule: async (
    projectId: string,
    input: AuditScheduleCreateRequest,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<AuditSchedule>(
      `/projects/${projectId}/audit-schedules`,
      input,
      options,
    );
    return strictValidate(auditScheduleSchema, res, 'runs.createSchedule');
  },
  updateSchedule: async (
    projectId: string,
    scheduleId: string,
    input: AuditScheduleUpdateRequest,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.patch<AuditSchedule>(
      `/projects/${projectId}/audit-schedules/${scheduleId}`,
      input,
      options,
    );
    return strictValidate(auditScheduleSchema, res, 'runs.updateSchedule');
  },
  listExecutions: async (auditId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<Execution[]>(`/audits/${auditId}/executions`, options);
    return strictValidate(executionListSchema, res, 'runs.listExecutions');
  },
  getExecution: async (executionId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<ExecutionEvidence>(`/executions/${executionId}`, options);
    return strictValidate(executionEvidenceSchema, res, 'runs.getExecution');
  },
  listPromptExecutions: async (
    scope: ProjectScope,
    promptId: string,
    params: PromptAnswerParams,
    options?: ApiRequestOptions,
  ) => {
    const path = withQuery(
      `/projects/${scope.projectId}/prompts/${promptId}/executions`,
      definedQuery(params),
    );
    const res = await apiClient.get<PromptAnswerPage>(path, options);
    return strictValidate(promptAnswerPageSchema, res, 'runs.listPromptExecutions');
  },
  downloadExport: (auditId: string, format: 'csv' | 'md', options: ApiRequestOptions) =>
    apiClient.getBlob(`/audits/${auditId}/export.${format}`, options),
  eventsUrl: (auditId: string) => `${API_BASE_URL}/audits/${auditId}/events?stream=true`,
};

const scoped = (scope: ProjectScope) => ({ workspaceId: scope.workspaceId });

export const runsQueries = {
  estimate: (workspaceId: string | null, input: AuditEstimateRequest | null) =>
    queryOptions({
      queryKey: queryKeys.runs.estimate(workspaceId, input),
      queryFn:
        workspaceId && input
          ? ({ signal }) => runsApi.estimateAudit(input, { signal, workspaceId })
          : skipToken,
    }),
  list: (scope: ProjectScope, params: RunsPageParams) =>
    queryOptions({
      queryKey: queryKeys.runs.list(scope, params),
      queryFn: ({ signal }) => runsApi.listAudits(scope, params, { signal, ...scoped(scope) }),
    }),
  schedules: (scope: ProjectScope) =>
    queryOptions({
      queryKey: queryKeys.runs.schedules(scope),
      queryFn: ({ signal }) => runsApi.listSchedules(scope.projectId, { signal, ...scoped(scope) }),
    }),
  detail: (workspaceId: string | null, auditId: string) =>
    queryOptions({
      queryKey: queryKeys.runs.detail(workspaceId, auditId),
      queryFn: ({ signal }) => runsApi.getAudit(auditId, { signal, workspaceId }),
    }),
  executions: (workspaceId: string | null, auditId: string) =>
    queryOptions({
      queryKey: queryKeys.runs.executions(workspaceId, auditId),
      queryFn: ({ signal }) => runsApi.listExecutions(auditId, { signal, workspaceId }),
    }),
  execution: (workspaceId: string | null, executionId: string | null) =>
    queryOptions({
      queryKey: queryKeys.runs.execution(workspaceId, executionId ?? ''),
      queryFn: executionId
        ? ({ signal }) => runsApi.getExecution(executionId, { signal, workspaceId })
        : skipToken,
    }),
  promptExecutions: (scope: ProjectScope, promptId: string, params: PromptAnswerParams) =>
    queryOptions({
      queryKey: queryKeys.visibility.promptAnswers(scope, promptId, params),
      queryFn: ({ signal }) =>
        runsApi.listPromptExecutions(scope, promptId, params, { signal, ...scoped(scope) }),
    }),
};

export function refreshAuditResults(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.visibility.all }),
    client.invalidateQueries({ queryKey: queryKeys.commerce.all }),
  ]);
}

export const refreshAuditDetail = (client: QueryClient, auditId: string) =>
  client.invalidateQueries({ queryKey: queryKeys.runs.auditDetail(auditId) });
export const refreshAuditExecutions = (client: QueryClient, auditId: string) =>
  client.invalidateQueries({ queryKey: queryKeys.runs.auditExecutions(auditId) });

export const runsMutations = {
  launch: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (input: AuditLaunchRequest) => {
        if (!workspaceId) throw new Error('Workspace is not available.');
        return runsApi.launchAudit(input, { workspaceId });
      },
      onSuccess: async (audits, _input, _result, { client }) => {
        for (const audit of audits)
          client.setQueryData(queryKeys.runs.detail(workspaceId, audit.id), audit);
        await client.invalidateQueries({ queryKey: queryKeys.runs.all });
      },
    }),
  cancel: (workspaceId: string | null, auditId: string) =>
    mutationOptions({
      mutationFn: () => runsApi.cancelAudit(auditId, { workspaceId }),
      onSuccess: (audit, _input, _result, { client }) => {
        client.setQueryData(queryKeys.runs.detail(workspaceId, auditId), audit);
        return Promise.all([
          client.invalidateQueries({ queryKey: queryKeys.runs.all }),
          refreshAuditResults(client),
        ]);
      },
    }),
  rerunFailures: (workspaceId: string | null, auditId: string) =>
    mutationOptions({
      mutationFn: () => runsApi.rerunFailures(auditId, {}, { workspaceId }),
      onSuccess: (_audit, _input, _result, { client }) =>
        client.invalidateQueries({ queryKey: queryKeys.runs.all }),
    }),
  createSchedule: (scope: ProjectScope) =>
    mutationOptions({
      mutationFn: (input: AuditScheduleCreateRequest) =>
        runsApi.createSchedule(scope.projectId, input, scoped(scope)),
      onSuccess: (_schedule, _input, _result, { client }) =>
        client.invalidateQueries({ queryKey: queryKeys.runs.schedules(scope) }),
    }),
  resumeSchedule: (scope: ProjectScope) =>
    mutationOptions({
      mutationFn: (scheduleId: string) =>
        runsApi.updateSchedule(scope.projectId, scheduleId, { enabled: true }, scoped(scope)),
      onSuccess: (_schedule, _input, _result, { client }) =>
        client.invalidateQueries({ queryKey: queryKeys.runs.schedules(scope) }),
    }),
};
