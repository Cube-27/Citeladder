import { mutationOptions, queryOptions } from '@tanstack/react-query';

import { apiClient } from './client';
import { queryKeys } from './query-keys';
import { policyStatusSchema } from '@citeladder/contracts/auth';
import type { TermsDecisionRequest } from '@citeladder/contracts/auth-requests';
import { strictValidate } from '@citeladder/contracts/validation';

export const policiesApi = {
  status: async (workspaceId: string, signal?: AbortSignal) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.get<unknown>(`/workspaces/${workspaceId}/policies`, { workspaceId, signal }),
      'policies.status',
    ),
  accept: async (workspaceId: string, termsRevision: string) =>
    strictValidate(
      policyStatusSchema,
      await apiClient.post<unknown>(
        `/workspaces/${workspaceId}/policies`,
        { terms_revision: termsRevision, accept_terms: true } satisfies TermsDecisionRequest,
        { workspaceId },
      ),
      'policies.accept',
    ),
};

export const policyQueries = {
  workspace: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.policies.workspace(workspaceId),
      queryFn: ({ signal }) => policiesApi.status(workspaceId, signal),
      staleTime: Number.POSITIVE_INFINITY,
    }),
};

export const policyMutations = {
  accept: () =>
    mutationOptions({
      mutationFn: ({ workspaceId, revision }: { workspaceId: string; revision: string }) =>
        policiesApi.accept(workspaceId, revision),
      onSuccess: (status, { workspaceId }, _result, { client }) =>
        client.setQueryData(queryKeys.policies.workspace(workspaceId), status),
    }),
};
