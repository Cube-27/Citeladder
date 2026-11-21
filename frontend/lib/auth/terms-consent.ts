import { useQuery } from '@tanstack/react-query';

import { authQueries } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';

export function usePublishedTerms(enabled = true) {
  const terms = useQuery({ ...authQueries.policies(), enabled });
  const { refetch } = terms;
  return {
    revision: terms.data?.terms_revision,
    error: terms.error,
    refreshOnRevisionChange: (error: unknown) => {
      if (isApiCode(error, 'policy_revision_changed')) void refetch();
      throw error;
    },
  };
}

export function sessionLacksTerms(error: unknown): boolean {
  return isApiCode(error, 'terms_decision_required');
}

export function revisionChanged(error: unknown): boolean {
  return isApiCode(error, 'policy_revision_changed');
}

function isApiCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
