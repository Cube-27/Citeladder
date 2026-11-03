'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { SessionUser } from '@/lib/api/types';
import { restartAt } from '@/lib/auth/account-transition';
import { hasPendingIntent } from '@/lib/billing/pending-pricing-intent';
import { PRICING_RESUME_QUERY_PARAM, PRICING_RETURN_PATH } from '@/lib/config/billing';
import { WORKSPACE_CHOOSER_PATH } from '@/lib/project/bootstrap';

/** Where a confirmed sign-in goes next. */
function signedInDestination(returnTo: string | undefined): string {
  if (returnTo) return returnTo;
  // A pricing selection captured before signing in wins over onboarding:
  // the visitor's last deliberate action was choosing a plan, and dropping
  // them on /projects would silently discard it. The flag is all that
  // travels — the intent itself stays in storage and is revalidated
  // against the live catalog before anything is purchased.
  if (hasPendingIntent()) return `${PRICING_RETURN_PATH}?${PRICING_RESUME_QUERY_PARAM}=1`;
  // The workspace chooser. Its route loader goes straight on, before anything
  // paints, when there is one destination, and sends someone with no
  // workspace to set one up.
  return WORKSPACE_CHOOSER_PATH;
}

/**
 * Login mutation wiring (F4): on success, route straight into the app — no
 * marketing-landing bounce. The confirmed identity boundary uses a full-page
 * navigation so the protected layout reads the new cookie and session state
 * from a clean document instead of reusing a prefetched anonymous shell. The
 * mutation stays pending until that document replaces this one, so the form
 * keeps saying it is signing in.
 */
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
