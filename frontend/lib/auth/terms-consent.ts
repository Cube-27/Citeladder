import { useQuery } from '@tanstack/react-query';

import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/query-keys';

/**
 * The published Terms revision the sign-in and sign-up forms ask a visitor to
 * accept. Every way in sends it with the decision, and the server records that
 * decision with the account when the person authenticates, so no screen after
 * sign-in asks again.
 */
export function usePublishedTerms(enabled = true) {
  const terms = useQuery({
    queryKey: queryKeys.auth.policies(),
    queryFn: () => authApi.policies(),
    // The published revision changes only with a deployment.
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });
  return { revision: terms.data?.terms_revision, error: terms.error };
}

/**
 * Whether the server refused a workspace step because this session holds no
 * Terms decision on the published revision (the Terms changed after sign-in).
 */
export function termsChanged(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'terms_decision_required' || error.code === 'policy_revision_changed')
  );
}
