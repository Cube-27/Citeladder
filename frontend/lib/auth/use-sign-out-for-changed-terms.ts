import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { signOutForChangedTerms } from '@/lib/auth/account-transition';

export function useSignOutForChangedTerms(sessionPredatesTerms: boolean) {
  const queryClient = useQueryClient();
  const leave = useMutation({ mutationFn: () => signOutForChangedTerms(queryClient) });
  const { mutate: signOut } = leave;
  const leaving = useRef(false);
  useEffect(() => {
    if (!sessionPredatesTerms || leaving.current) return;
    leaving.current = true;
    signOut();
  }, [signOut, sessionPredatesTerms]);
  return leave;
}
