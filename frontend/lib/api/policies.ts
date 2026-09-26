import { apiClient } from './client';
import { policyStatusSchema } from './schemas/auth';
import { strictValidate } from './schemas/validation';

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
        { terms_revision: termsRevision, accept_terms: true },
        { workspaceId },
      ),
      'policies.accept',
    ),
};
