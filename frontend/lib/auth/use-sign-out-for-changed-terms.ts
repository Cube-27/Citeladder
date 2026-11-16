import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { signOutForChangedTerms } from '@/lib/auth/account-transition';

/** Ends a session older than the published Terms; returns the sign-out for its error and retry. */
export function useSignOutForChangedTerms(sessionPredatesTerms: boolean) {
  const queryClient = useQueryClient();
  const leave = useMutation({ mutationFn: () => signOutForChangedTerms(queryClient) });
  const { mutate: signOut } = leave;
  // Once: leaving clears the cache, and the re-read must not sign out again.
  const leaving = useRef(false);
  useEffect(() => {
    if (!sessionPredatesTerms || leaving.current) return;
    leaving.current = true;
    signOut();
  }, [signOut, sessionPredatesTerms]);
  return leave;
}
