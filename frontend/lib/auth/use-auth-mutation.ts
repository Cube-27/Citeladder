'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/api/query-keys';
import type { SessionUser } from '@/lib/api/types';
import { clearAccountScopedClientState } from '@/lib/auth/account-transition';
import { hasPendingIntent } from '@/lib/billing/pending-pricing-intent';
import { PRICING_RESUME_QUERY_PARAM, PRICING_RETURN_PATH } from '@/lib/config/billing';
import { hardNavigate } from '@/lib/navigation/hard-navigate';

/**
 * Login mutation wiring (F4): on success, prime the `me` cache with the
 * returned user and route straight into the app — no marketing-landing
 * bounce. The confirmed identity boundary uses a full-page navigation so the
 * protected layout reads the new cookie and session state from a clean
 * document instead of reusing a prefetched anonymous shell; the shell's gate
 * then decides whether this workspace needs onboarding.
 */
export function useAuthMutation<TValues>(
  mutationFn: (values: TValues) => Promise<SessionUser>,
  returnTo?: string,
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    onSuccess: async (user: SessionUser) => {
      // Login is an identity boundary. Remove the previous account's
      // requests, cache, active workspace header, and project selection before
      // the newly-confirmed identity is seeded.
      await clearAccountScopedClientState(queryClient);
      queryClient.setQueryData(queryKeys.auth.me(), user);

      if (returnTo) {
        hardNavigate(returnTo);
        return;
      }

      // A pricing selection captured before signing in wins over onboarding:
      // the visitor's last deliberate action was choosing a plan, and dropping
      // them on /projects would silently discard it. The flag is all that
      // travels — the intent itself stays in storage and is revalidated
      // against the live catalog before anything is purchased.
      if (hasPendingIntent()) {
        hardNavigate(`${PRICING_RETURN_PATH}?${PRICING_RESUME_QUERY_PARAM}=1`);
        return;
      }

      // Straight to the app. Deciding between `/projects` and `/onboarding`
      // here used to mean fetching the project list before navigating —
      // unscoped, because no workspace is resolved yet, and therefore
      // answering for whichever workspace the backend picked by default. The
      // shell's own gate now makes that decision from the resolved workspace,
      // so login neither pays that round trip nor risks routing on another
      // workspace's answer.
      hardNavigate('/projects');
    },
  });

  const submit = (values: TValues) => mutation.mutateAsync(values).catch(() => undefined);

  return { mutation, submit };
}
