/**
 * Opportunities domain endpoints + query/mutation options.
 *
 * Owns transport for the Opportunities slice: the priority-sorted keyset
 * catalog, the latest recompute summary, the row detail, the shared queue
 * order and implementation declarations. Workflow status belongs to Actions
 * (`lib/api/actions.ts`). Every JSON response passes through `strictValidate`
 * (fail loud on any drift — the backend is the source of truth). All paths are relative
 * `/api/v1` (same-origin proxy, invariant 12) and every read accepts an
 * `AbortSignal` via `ApiRequestOptions`.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  implementationEventSchema,
  implementationEventsPageSchema,
  opportunitiesPageSchema,
  opportunityDetailSchema,
  opportunityOrderResponseSchema,
  opportunitySummarySchema,
} from './schemas/opportunities';
import { strictValidate } from './schemas/validation';
import { definedQuery, withQuery } from './shared';
import type {
  ImplementationEvent,
  OpportunitiesPage,
  OpportunityDetail,
  OpportunitySummary,
} from './types';

/** Keyset catalog params. Ordering is server-owned (priority desc, id desc). */
export type OpportunitiesParams = {
  cursor?: string;
  limit?: number;
  type?: string;
  severity?: string;
  status?: string;
  rule_id?: string;
  min_priority?: number;
  action_path?: 'owned' | 'earned';
};

export type OpportunityOrderUpdate = {
  ordered_opportunity_ids: string[];
  expected_version: number;
};

type ExpectedCheck =
  | {
      kind: 'site_rule';
      target_site_url_id?: string;
      rule_id: string;
      expected_outcome: 'pass' | 'fail' | 'partial';
    }
  | {
      kind: 'page_fact';
      target_site_url_id?: string;
      fact_key: string;
      expected_value: unknown;
    }
  | {
      kind: 'visibility_metric' | 'traffic_metric';
      metric: string;
      direction: 'increase' | 'decrease' | 'equal';
      expected_value: number;
      tolerance?: number;
    };
export type ImplementationEventCreate = {
  opportunity_id: string;
  target_site_url_ids: string[];
  declared_implemented_at: string;
  expected_checks: ExpectedCheck[];
};

export const opportunitiesApi = {
  list: async (projectId: string, params?: OpportunitiesParams, options?: ApiRequestOptions) => {
    const path = withQuery(`/projects/${projectId}/opportunities`, definedQuery(params));
    const res = await apiClient.get<OpportunitiesPage>(path, options);
    return strictValidate(opportunitiesPageSchema, res, 'opportunities.list');
  },
  get: async (opportunityId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<OpportunityDetail>(`/opportunities/${opportunityId}`, options);
    return strictValidate(opportunityDetailSchema, res, 'opportunities.get');
  },
  updateOrder: async (
    projectId: string,
    input: OpportunityOrderUpdate,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.put(`/projects/${projectId}/opportunities/order`, input, options);
    return strictValidate(opportunityOrderResponseSchema, res, 'opportunities.updateOrder');
  },
  summary: async (projectId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<OpportunitySummary>(
      `/projects/${projectId}/opportunities/summary`,
      options,
    );
    return strictValidate(opportunitySummarySchema, res, 'opportunities.summary');
  },
  createImplementationEvent: async (
    projectId: string,
    input: ImplementationEventCreate,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<ImplementationEvent>(
      `/projects/${projectId}/opportunities/implementation-events`,
      input,
      { ...options, idempotencyKey, retryNetworkFailures: true },
    );
    return strictValidate(implementationEventSchema, res, 'opportunities.implementation.create');
  },
  listImplementationEvents: async (
    projectId: string,
    opportunityId?: string,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.get(
      withQuery(
        `/projects/${projectId}/opportunities/implementation-events`,
        definedQuery({ opportunity_id: opportunityId }),
      ),
      options,
    );
    return strictValidate(implementationEventsPageSchema, res, 'opportunities.implementation.list');
  },
};

function extractProjectId(queryKey: readonly unknown[] | undefined): string | undefined {
  if (queryKey?.[0] !== 'opportunities') return undefined;
  if (queryKey[1] === 'list' || queryKey[1] === 'summary') {
    return typeof queryKey[2] === 'string' ? queryKey[2] : undefined;
  }
  return undefined;
}

function isSameProjectQuery(
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  projectId: string,
): boolean {
  return extractProjectId(previousQuery?.queryKey) === projectId;
}

/**
 * React Query option factories. The query key ↔ endpoint pairing lives here
 * so screens pass these straight to `useQuery` / `useMutation`. Every
 * `queryFn` forwards the abort signal.
 */
export const opportunitiesQueries = {
  list: (workspaceId: string, projectId: string, params?: OpportunitiesParams) =>
    queryOptions({
      queryKey: queryKeys.opportunities.list(projectId, {
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
        type: params?.type ?? null,
        severity: params?.severity ?? null,
        status: params?.status ?? null,
        rule_id: params?.rule_id ?? null,
        min_priority: params?.min_priority ?? null,
        action_path: params?.action_path ?? null,
      }),
      queryFn: ({ signal }) => opportunitiesApi.list(projectId, params, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        isSameProjectQuery(previousQuery, projectId) ? previousData : undefined,
    }),
  detail: (workspaceId: string, opportunityId: string) =>
    queryOptions({
      queryKey: queryKeys.opportunities.detail(opportunityId),
      queryFn: ({ signal }) => opportunitiesApi.get(opportunityId, { signal, workspaceId }),
    }),
  summary: (workspaceId: string, projectId: string) =>
    queryOptions({
      queryKey: queryKeys.opportunities.summary(projectId),
      queryFn: ({ signal }) => opportunitiesApi.summary(projectId, { signal, workspaceId }),
      placeholderData: (previousData, previousQuery) =>
        isSameProjectQuery(previousQuery, projectId) ? previousData : undefined,
    }),
  implementationEvents: (workspaceId: string, projectId: string, opportunityId?: string) =>
    queryOptions({
      queryKey: queryKeys.opportunities.implementationEvents(projectId, opportunityId),
      queryFn: ({ signal }) =>
        opportunitiesApi.listImplementationEvents(projectId, opportunityId, {
          signal,
          workspaceId,
        }),
    }),
};

export const opportunitiesMutations = {
  createImplementationEvent: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: {
        projectId: string;
        input: ImplementationEventCreate;
        idempotencyKey: string;
      }) =>
        opportunitiesApi.createImplementationEvent(
          vars.projectId,
          vars.input,
          vars.idempotencyKey,
          {
            workspaceId,
          },
        ),
    }),
};
