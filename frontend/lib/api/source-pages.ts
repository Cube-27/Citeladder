/**
 * Externally cited pages: the grouped competitor read, one page's detail, and
 * the explicit inspect command.
 *
 * Both reads render persisted projections. Neither triggers a fetch of the
 * publisher's page — that only ever happens through the inspect mutation
 * below, which is an authorized command that spends the project's inspection
 * budget exactly as automatic selection does. Opening a page detail is not a
 * reason to go and read someone's site.
 *
 * Same-origin `/api/v1` only; every response passes `strictValidate`.
 */
import { mutationOptions, queryOptions } from '@tanstack/react-query';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  competitorAnalysisSchema,
  sourcePageDetailSchema,
  sourcePageInspectionSchema,
} from './schemas/source-pages';
import { strictValidate } from './schemas/validation';

const sourcePagesApi = {
  getCompetitorAnalysis: async (projectId: string, options?: ApiRequestOptions) => {
    const result = await apiClient.get(
      `/projects/${projectId}/source-pages/competitor-analysis`,
      options,
    );
    return strictValidate(competitorAnalysisSchema, result, 'sourcePages.getCompetitorAnalysis');
  },
  getPage: async (projectId: string, urlHash: string, options?: ApiRequestOptions) => {
    const result = await apiClient.get(`/projects/${projectId}/source-pages/${urlHash}`, options);
    return strictValidate(sourcePageDetailSchema, result, 'sourcePages.getPage');
  },
  inspect: async (projectId: string, urlHash: string, options?: ApiRequestOptions) => {
    const result = await apiClient.post(
      `/projects/${projectId}/source-pages/${urlHash}/inspect`,
      undefined,
      options,
    );
    return strictValidate(sourcePageInspectionSchema, result, 'sourcePages.inspect');
  },
};

export const sourcePagesQueries = {
  competitorAnalysis: (workspaceId: string, projectId: string) =>
    queryOptions({
      queryKey: queryKeys.sourcePages.competitorAnalysis(projectId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        sourcePagesApi.getCompetitorAnalysis(projectId, { signal, workspaceId }),
    }),
  page: (workspaceId: string, projectId: string, urlHash: string) =>
    queryOptions({
      queryKey: queryKeys.sourcePages.page(projectId, urlHash),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        sourcePagesApi.getPage(projectId, urlHash, { signal, workspaceId }),
    }),
};

export const sourcePagesMutations = {
  /**
   * Ask for one page to be inspected ahead of the automatic selection.
   *
   * A command, never a side effect of opening the detail. It answers with
   * whether the request was admitted and what the budget has left, including
   * when it was declined — a refusal a caller cannot see is a refusal that
   * reads as silence.
   */
  inspect: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { projectId: string; urlHash: string }) =>
        sourcePagesApi.inspect(vars.projectId, vars.urlHash, { workspaceId }),
    }),
};
