import { queryOptions } from '@tanstack/react-query';
import { internalLinksReadSchema } from '@citeladder/contracts/site-health';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import { strictValidate } from '@citeladder/contracts/validation';

const root = (projectId: string) => `/projects/${projectId}/site-health/internal-links`;

export const internalLinksApi = {
  async read(projectId: string, analysisId: string | undefined, options: ApiRequestOptions) {
    const path =
      root(projectId) + (analysisId ? `?analysis_id=${encodeURIComponent(analysisId)}` : '');
    return strictValidate(
      internalLinksReadSchema,
      await apiClient.get(path, options),
      'internalLinks.read',
    );
  },
  async analyze(
    projectId: string,
    input: { crawl_id: string; idempotency_key: string },
    options: ApiRequestOptions,
  ) {
    return strictValidate(
      internalLinksReadSchema,
      await apiClient.post(`${root(projectId)}/analyses`, input, options),
      'internalLinks.analyze',
    );
  },
  async cancel(projectId: string, analysisId: string, options: ApiRequestOptions) {
    return strictValidate(
      internalLinksReadSchema,
      await apiClient.post(`${root(projectId)}/analyses/${analysisId}/cancel`, {}, options),
      'internalLinks.cancel',
    );
  },
};

export const internalLinksQuery = (workspaceId: string, projectId: string, analysisId?: string) =>
  queryOptions({
    queryKey: queryKeys.siteHealth.internalLinks(workspaceId, projectId, analysisId),
    queryFn: ({ signal }) => internalLinksApi.read(projectId, analysisId, { workspaceId, signal }),
  });
