import { queryOptions } from '@tanstack/react-query';
import { contentStructureReadSchema } from '@citeladder/contracts/site-health';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import { strictValidate } from '@citeladder/contracts/validation';

const root = (projectId: string) => `/projects/${projectId}/site-health/content-structure`;

export const contentStructureApi = {
  async read(projectId: string, analysisId: string | undefined, options: ApiRequestOptions) {
    const path =
      root(projectId) + (analysisId ? `?analysis_id=${encodeURIComponent(analysisId)}` : '');
    return strictValidate(
      contentStructureReadSchema,
      await apiClient.get(path, options),
      'contentStructure.read',
    );
  },
  async analyze(
    projectId: string,
    input: { crawl_id: string; idempotency_key: string },
    options: ApiRequestOptions,
  ) {
    return strictValidate(
      contentStructureReadSchema,
      await apiClient.post(`${root(projectId)}/analyses`, input, options),
      'contentStructure.analyze',
    );
  },
  async cancel(projectId: string, analysisId: string, options: ApiRequestOptions) {
    return strictValidate(
      contentStructureReadSchema,
      await apiClient.post(`${root(projectId)}/analyses/${analysisId}/cancel`, {}, options),
      'contentStructure.cancel',
    );
  },
};

export const contentStructureQuery = (
  workspaceId: string,
  projectId: string,
  analysisId?: string,
) =>
  queryOptions({
    queryKey: queryKeys.siteHealth.contentStructure(workspaceId, projectId, analysisId),
    queryFn: ({ signal }) =>
      contentStructureApi.read(projectId, analysisId, { workspaceId, signal }),
  });
