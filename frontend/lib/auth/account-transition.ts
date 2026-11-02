import type { QueryClient } from '@tanstack/react-query';

import { authApi } from '@/lib/api/auth';
import { TERMS_CHANGED_CODE } from '@/lib/auth/forms';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { clearActiveProjectSelection } from '@/lib/project/active-project-storage';

/**
 * Remove every account-scoped client value at a confirmed identity boundary.
 *
 * Cancellation happens before cache destruction so an old account's request
 * cannot repopulate the shared QueryClient after login/logout has crossed to a
 * different identity. Project selection is account-scoped; theme and other
 * device preferences deliberately survive.
 */
export async function clearAccountScopedClientState(queryClient: QueryClient) {
  try {
    await queryClient.cancelQueries();
  } catch {
    // Cancellation is best-effort. Identity-boundary cleanup must still
    // resolve successfully so a confirmed login/logout can navigate.
  } finally {
    queryClient.clear();
    clearActiveProjectSelection();
  }
}

/** Cross an identity or membership boundary: clear account state, then reload at `path`. */
export async function restartAt(queryClient: QueryClient, path: string) {
  await clearAccountScopedClientState(queryClient);
  hardNavigate(path);
}

/** Sign out from a screen outside the account menu: revoke, then restart at sign-in. */
export async function signOut(queryClient: QueryClient) {
  await authApi.logout();
  await restartAt(queryClient, '/login');
}

/**
 * End a session that predates the published Terms revision: the sign-in form
 * says why and asks for the decision on its required box. No consent screen
 * inside the app asks instead.
 */
export async function signOutForChangedTerms(queryClient: QueryClient) {
  await authApi.logout();
  await restartAt(queryClient, `/login?error=${TERMS_CHANGED_CODE}`);
}
