/**
 * Actions endpoints + query/mutation options.
 *
 * An Action is the unit of work over the Opportunity store: every live
 * Opportunity sharing one target, plus Agent work on that target. Reads are
 * persisted projections; the writes are the user's workflow decision and
 * the implementation declaration.
 */
import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  type QueryClient,
} from '@tanstack/react-query';
import type { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import type { ProjectScope } from './query-keys/scope';
import {
  ACTION_STATUS_ANY,
  actionAnalyzeResultSchema,
  actionBulkStatusResultSchema,
  actionDeclarationSchema,
  actionDetailSchema,
  actionItemSchema,
  actionStatusSchema,
  actionsPageSchema,
  actionTreeSchema,
  analyzablePagesSchema,
  type ActionAnalyzeRequest,
  type ActionBulkStatusRequest,
  type ActionDeclarationRequest,
  type ActionPriorityBand,
  type ActionTree,
  type ActionTreeGroupBy,
  type ActionUserStatus,
} from '@citeladder/contracts/actions';
import { strictValidate } from '@citeladder/contracts/validation';
import { definedQuery, withQuery } from './shared';
import { ACTIONS_GROUPING_PAGE_SIZE, AGENT_MENTION_SEARCH_LIMIT } from '@/lib/config/agent';
import { TABLE_DEFAULT_PAGE_SIZE } from '@/lib/config/tables';

export type Action = z.infer<typeof actionItemSchema>;
export type ActionsPage = z.infer<typeof actionsPageSchema>;
export type ActionDetail = z.infer<typeof actionDetailSchema>;
export type ActionStatus = z.infer<typeof actionStatusSchema>;
export type { ActionPriorityBand, ActionTree, ActionTreeGroupBy };
export type ActionDeclaration = z.infer<typeof actionDeclarationSchema>;
export type MeasurementLeg = ActionDeclaration['legs'][number];
export type AnalyzablePage = z.infer<typeof analyzablePagesSchema>['items'][number];

/** The Actions page's filters beside its status and grouping. */
export type ActionTreeFilters = Readonly<{ priority?: ActionPriorityBand; family?: string }>;

/** One tree read: a status, what it groups by first, and the filters. */
export type ActionTreeParams = ActionTreeFilters &
  Readonly<{ status: ActionStatus; group_by: ActionTreeGroupBy }>;

/** The page's first read with nothing in its address: New, by goal. The route prefetch warms it. */
export const DEFAULT_ACTION_TREE = {
  status: 'open',
  group_by: 'goal',
} as const satisfies ActionTreeParams;

/** One tree grouping's rows: the tree's filters, its group's own filter and the grouping. */
export type ActionGroupingParams = Readonly<{
  status: ActionStatus;
  grouping: string;
  /** The tree's Impact filter, or an Impact group's band. */
  priority?: string;
  family?: string;
  approach?: string;
  ownership?: string;
  topic?: string;
}>;

export type ActionsParams = {
  cursor?: string;
  limit?: number;
  /** Omitted: the work queue (open and in progress); `any` keeps every status. */
  status?: ActionStatus | typeof ACTION_STATUS_ANY;
  /** Text the Action's label contains. */
  q?: string;
  target_kind?: string;
  approach?: string;
  priority?: ActionPriorityBand;
  /** An evidence family: the Action's Source. */
  family?: string;
};

type Query = Readonly<Record<string, string | undefined>>;

export const actionsApi = {
  list: async (projectId: string, params?: ActionsParams, options?: ApiRequestOptions) =>
    strictValidate(
      actionsPageSchema,
      await apiClient.get(
        withQuery(`/projects/${projectId}/actions`, definedQuery(params)),
        options,
      ),
      'actions.list',
    ),
  /** The tree's grouping rows or any filtered page: the list read with free-form filters. */
  page: async (projectId: string, query: Query, options?: ApiRequestOptions) =>
    strictValidate(
      actionsPageSchema,
      await apiClient.get(
        withQuery(`/projects/${projectId}/actions`, definedQuery(query)),
        options,
      ),
      'actions.page',
    ),
  tree: async (projectId: string, params: ActionTreeParams, options?: ApiRequestOptions) =>
    strictValidate(
      actionTreeSchema,
      await apiClient.get(
        withQuery(`/projects/${projectId}/actions/tree`, definedQuery(params)),
        options,
      ),
      'actions.tree',
    ),
  bulkStatus: async (
    projectId: string,
    body: ActionBulkStatusRequest,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      actionBulkStatusResultSchema,
      await apiClient.post(`/projects/${projectId}/actions/status`, body, options),
      'actions.bulkStatus',
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
  declare: async (
    actionId: string,
    input: ActionDeclarationRequest,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      actionDeclarationSchema,
      await apiClient.post(`/actions/${actionId}/declaration`, input, {
        ...options,
        idempotencyKey,
        retryNetworkFailures: true,
      }),
      'actions.declare',
    ),
  analyzablePages: async (projectId: string, search: string, options?: ApiRequestOptions) =>
    strictValidate(
      analyzablePagesSchema,
      await apiClient.get(
        withQuery(
          `/projects/${projectId}/actions/analyze/pages`,
          definedQuery({ q: search.trim() || undefined }),
        ),
        options,
      ),
      'actions.analyzablePages',
    ),
  analyze: async (
    projectId: string,
    input: ActionAnalyzeRequest,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      actionAnalyzeResultSchema,
      await apiClient.post(`/projects/${projectId}/actions/analyze`, input, {
        ...options,
        idempotencyKey,
      }),
      'actions.analyze',
    ),
};

/**
 * One page of Actions. Without a limit it is the Actions table's first page
 * at its default size, so the navigation badge, the Agent's top Actions and
 * the table share one request instead of asking for two page sizes of the
 * same queue.
 */
function actionListQuery(scope: ProjectScope, params?: ActionsParams) {
  const request = { ...params, limit: params?.limit ?? TABLE_DEFAULT_PAGE_SIZE };
  return queryOptions({
    queryKey: queryKeys.actions.list(scope, {
      status: request.status ?? null,
      q: request.q ?? null,
      targetKind: request.target_kind ?? null,
      approach: request.approach ?? null,
      priority: request.priority ?? null,
      family: request.family ?? null,
      cursor: request.cursor ?? null,
      limit: request.limit,
    }),
    queryFn: ({ signal }) =>
      actionsApi.list(scope.projectId, request, { signal, workspaceId: scope.workspaceId }),
  });
}

/** Action reads: the work queue, the composer's mention pool and one Action. */
export const actionsQueries = {
  list: actionListQuery,
  /** The Actions page under one status: counts, goals and each grouping's first rows. */
  tree: (scope: ProjectScope, params: ActionTreeParams) =>
    queryOptions({
      queryKey: queryKeys.actions.tree(scope, params),
      queryFn: ({ signal }) =>
        actionsApi.tree(scope.projectId, params, { signal, workspaceId: scope.workspaceId }),
    }),
  /** A grouping's rows past the tree's first page, a page per "Show more", from the tree's cursor. */
  groupingRows: (scope: ProjectScope, params: ActionGroupingParams, cursor: string) =>
    infiniteQueryOptions({
      queryKey: queryKeys.actions.groupingRows(scope, params, cursor),
      initialPageParam: cursor,
      queryFn: ({ signal, pageParam }) =>
        actionsApi.page(
          scope.projectId,
          { ...params, cursor: pageParam, limit: String(ACTIONS_GROUPING_PAGE_SIZE) },
          { signal, workspaceId: scope.workspaceId },
        ),
      getNextPageParam: (page) => page.next_cursor ?? undefined,
    }),
  /**
   * The Actions the Agent composer's `@` menu offers for typed text: any
   * status, so an Action being measured or done is still found by name.
   */
  mentionSearch: (scope: ProjectScope, search: string) =>
    actionListQuery(scope, {
      status: ACTION_STATUS_ANY,
      q: search.trim() || undefined,
      limit: AGENT_MENTION_SEARCH_LIMIT,
    }),
  detail: (workspaceId: string | null, actionId: string) =>
    queryOptions({
      queryKey: queryKeys.actions.detail(workspaceId, actionId),
      queryFn: ({ signal }) => actionsApi.get(actionId, { signal, workspaceId }),
    }),
  /** Analyze a page's picker: the latest crawl's content pages matching `search`. */
  analyzablePages: (scope: ProjectScope, search: string) =>
    queryOptions({
      queryKey: queryKeys.actions.analyzePages(scope, search.trim()),
      queryFn: ({ signal }) =>
        actionsApi.analyzablePages(scope.projectId, search, {
          signal,
          workspaceId: scope.workspaceId,
        }),
    }),
};

/** Every Action read: a status change or a declaration moves the queue, its counts and the detail. */
const refreshActions = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: queryKeys.actions.all });

/**
 * The Site Health internal-links review: declaring selected link
 * recommendations implemented changes which ones it still offers.
 */
const refreshInternalLinkReview = (client: QueryClient, projectId: string) =>
  client.invalidateQueries({
    queryKey: queryKeys.siteHealth.resource(projectId, 'internal-links'),
  });

/** Action writes; each success refreshes every read it changes. */
export const actionsMutations = {
  updateStatus: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (vars: { actionId: string; status: ActionUserStatus }) =>
        actionsApi.updateStatus(vars.actionId, vars.status, { workspaceId }),
      // The refresh runs in the background: the control settles on the write.
      onSuccess: (_action, _vars, _result, { client }) => void refreshActions(client),
    }),
  /** One decision on the ticked Actions, or on every Action a filter matches (Accept all). */
  bulkStatus: (scope: ProjectScope) =>
    mutationOptions({
      mutationFn: (body: ActionBulkStatusRequest) =>
        actionsApi.bulkStatus(scope.projectId, body, { workspaceId: scope.workspaceId }),
      onSettled: (_result, _error, _body, _context, { client }) => void refreshActions(client),
    }),
  /**
   * A declaration closes the Action's work; one naming internal-link
   * recommendations also changes the internal-links review it came from. The
   * refresh runs in the background, so the dialog closes on the write.
   */
  declare: (workspaceId: string | null) =>
    mutationOptions({
      mutationFn: (vars: {
        actionId: string;
        /** The Action's project, whose internal-links review the declaration may change. */
        projectId: string;
        input: ActionDeclarationRequest;
        idempotencyKey: string;
      }) => actionsApi.declare(vars.actionId, vars.input, vars.idempotencyKey, { workspaceId }),
      onSuccess: (_declaration, vars, _result, { client }) =>
        void Promise.all([
          refreshActions(client),
          vars.input.recommendation_ids
            ? refreshInternalLinkReview(client, vars.projectId)
            : undefined,
        ]),
    }),
  /**
   * Analyze a page: the page's Action (new or reused) and a new page chat on
   * it. The Actions list and the Agent's chat list both gain a row.
   */
  analyze: (scope: ProjectScope) =>
    mutationOptions({
      mutationFn: (vars: { input: ActionAnalyzeRequest; idempotencyKey: string }) =>
        actionsApi.analyze(scope.projectId, vars.input, vars.idempotencyKey, {
          workspaceId: scope.workspaceId,
        }),
      onSuccess: (_started, _vars, _result, { client }) =>
        void Promise.all([
          refreshActions(client),
          client.invalidateQueries({ queryKey: queryKeys.agent.chatLists(scope.projectId) }),
        ]),
    }),
};
