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
  /**
   * The person's Terms acceptance for one workspace. Acceptance only changes
   * through `policyMutations.accept`, which writes this read itself.
   */
  workspace: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.policies.workspace(workspaceId),
      queryFn: ({ signal }) => policiesApi.status(workspaceId, signal),
      staleTime: Number.POSITIVE_INFINITY,
    }),
};

export const policyMutations = {
  /**
   * Record acceptance of a Terms revision; the answer is the workspace's new
   * status. The workspace is a variable, so one gate outlives a switch and
   * tells its own workspace's attempt from the last one's.
   */
  accept: () =>
    mutationOptions({
      mutationFn: ({ workspaceId, revision }: { workspaceId: string; revision: string }) =>
        policiesApi.accept(workspaceId, revision),
      onSuccess: (status, { workspaceId }, _result, { client }) =>
        client.setQueryData(queryKeys.policies.workspace(workspaceId), status),
    }),
};
