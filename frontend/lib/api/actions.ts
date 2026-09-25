/**
 * Actions endpoints + query/mutation options.
 *
 * An Action is the unit of work over the Opportunity store: every live
 * Opportunity sharing one target, plus Agent work on that target. Reads are
 * persisted projections; the only write is the user's workflow decision.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  actionDetailSchema,
  actionItemSchema,
  actionStatusSchema,
  actionsPageSchema,
} from './schemas/actions';
import { strictValidate } from './schemas/validation';
import { definedQuery, withQuery } from './shared';

export type Action = z.infer<typeof actionItemSchema>;
export type ActionDetail = z.infer<typeof actionDetailSchema>;
export type ActionStatus = z.infer<typeof actionStatusSchema>;
/** The statuses a user may store; the rest are derived or declared. */
export type ActionUserStatus = Extract<ActionStatus, 'open' | 'dismissed'>;

export type ActionsParams = {
  cursor?: string;
  limit?: number;
  /** Omitted: the work queue (open and in progress). */
  status?: ActionStatus;
  target_kind?: string;
};

const actionsApi = {
  list: async (projectId: string, params?: ActionsParams, options?: ApiRequestOptions) =>
    strictValidate(
      actionsPageSchema,
      await apiClient.get(
        withQuery(`/projects/${projectId}/actions`, definedQuery(params)),
        options,
      ),
      'actions.list',
    ),
  get: async (actionId: string, options?: ApiRequestOptions) =>
    strictValidate(
      actionDetailSchema,
      await apiClient.get(`/actions/${actionId}`, options),
      'actions.get',
    ),
  updateStatus: async (actionId: string, status: ActionUserStatus, options?: ApiRequestOptions) =>
    strictValidate(
      actionItemSchema,
      await apiClient.patch(`/actions/${actionId}`, { status }, options),
      'actions.updateStatus',
    ),
};

export const actionsQueries = {
  list: (workspaceId: string, projectId: string, params?: ActionsParams) =>
    queryOptions({
      queryKey: queryKeys.actions.list(projectId, {
        status: params?.status ?? null,
        targetKind: params?.target_kind ?? null,
        cursor: params?.cursor ?? null,
        limit: params?.limit ?? null,
      }),
      queryFn: ({ signal }) => actionsApi.list(projectId, params, { signal, workspaceId }),
    }),
  detail: (workspaceId: string, actionId: string) =>
    queryOptions({
      queryKey: queryKeys.actions.detail(actionId),
      queryFn: ({ signal }) => actionsApi.get(actionId, { signal, workspaceId }),
    }),
};

export const actionsMutations = {
  updateStatus: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { actionId: string; status: ActionUserStatus }) =>
        actionsApi.updateStatus(vars.actionId, vars.status, { workspaceId }),
    }),
};
