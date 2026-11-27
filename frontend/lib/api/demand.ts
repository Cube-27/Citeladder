import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import { httpErrorStatus } from './errors';
import { queryKeys } from './query-keys';
import type { ProjectScope } from './query-keys/scope';
import { demandSignalSchema, demandSnapshotSchema } from '@citeladder/contracts';
import { strictValidate } from '@citeladder/contracts/validation';

export type DemandSignal = z.infer<typeof demandSignalSchema>;
export type DemandSnapshot = z.infer<typeof demandSnapshotSchema>;

export const demandApi = {
  getLatest: async (projectId: string, options?: ApiRequestOptions) =>
    strictValidate(
      demandSnapshotSchema,
      await apiClient.get<unknown>(`/projects/${projectId}/demand/latest`, options),
      'demand.getLatest',
    ),
};

export const demandQueries = {
  latest: (scope: ProjectScope) =>
    queryOptions({
      queryKey: queryKeys.demand.latest(scope),
      queryFn: async ({ signal }) => {
        try {
          return await demandApi.getLatest(scope.projectId, {
            signal,
            workspaceId: scope.workspaceId,
          });
        } catch (error) {
          if (httpErrorStatus(error) === 404) return null;
          throw error;
        }
      },
    }),
};
