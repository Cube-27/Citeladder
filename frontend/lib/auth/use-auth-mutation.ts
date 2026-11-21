import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { SessionUser } from '@citeladder/contracts';
import { restartAt } from '@/lib/auth/account-transition';
import { hasPendingIntent } from '@/lib/billing/pending-pricing-intent';
import { PRICING_RESUME_QUERY_PARAM, PRICING_RETURN_PATH } from '@/lib/config/billing';
import { WORKSPACE_CHOOSER_PATH } from '@/lib/project/bootstrap';

function signedInDestination(returnTo: string | undefined): string {
  if (returnTo) return returnTo;
  if (hasPendingIntent()) return `${PRICING_RETURN_PATH}?${PRICING_RESUME_QUERY_PARAM}=1`;
  return WORKSPACE_CHOOSER_PATH;
}

export function useAuthMutation<TValues>(
  mutationFn: (values: TValues) => Promise<SessionUser>,
  returnTo?: string,
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: () => restartAt(queryClient, signedInDestination(returnTo)),
  });

  const submit = (values: TValues) => mutation.mutateAsync(values).catch(() => undefined);

  return { mutation, submit };
}
