import type { QueryClient } from '@tanstack/react-query';

import { authApi } from '@/lib/api/auth';
import { httpErrorStatus } from '@/lib/api/errors';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { clearActiveProjectSelection } from '@/lib/project/active-project-storage';

/**
 * The sign-in notice for a session ended because the published Terms changed.
 * Defined here, not beside the form schemas, so the eager shell never loads them.
 */
export const TERMS_CHANGED_CODE = 'terms_changed';

/** Query clients whose document is already leaving across an identity boundary. */
const departing = new WeakSet<QueryClient>();

/** Whether this client's document has already started leaving for another identity. */
export function isDeparting(queryClient: QueryClient): boolean {
  return departing.has(queryClient);
}

/**
 * Drop the in-memory cache when the document is actually left, and never show
 * a back-forward-cached copy of it again: a page restored from that cache
 * reloads, so the server decides what the next identity may see.
 */
function discardWhenLeft(queryClient: QueryClient) {
  window.addEventListener('pagehide', () => queryClient.clear(), { once: true });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });
}

/**
 * Cross an identity or membership boundary: reload at `path` with nothing of
 * the previous account carried over.
 *
 * The departing page keeps drawing what it shows until the next document
 * replaces it. Clearing the cache first redrew it as empty placeholders for
 * the whole time the next document loaded, though a full-document navigation
 * discards in-memory state anyway. So in-flight requests are cancelled (none
 * can land after the boundary), the account-scoped project selection is
 * removed from device storage now (theme and other device preferences
 * survive), and the cache itself goes when the page is hidden.
 *
 * Never resolves: the document is leaving, and every caller's pending state
 * ("Signing in…", "Signing out…") holds until it has.
 */
export async function restartAt(queryClient: QueryClient, path: string): Promise<never> {
  departing.add(queryClient);
  try {
    await queryClient.cancelQueries();
  } catch {
    // Cancellation is best-effort: a confirmed boundary must still navigate.
  }
  clearActiveProjectSelection();
  discardWhenLeft(queryClient);
  hardNavigate(path);
  return new Promise<never>(() => {
    // Settled by the next document replacing this one.
  });
}

/**
 * Revoke the session cookie. A 401 means the session had already ended, which
 * is what signing out asks for, so it counts as done rather than as a failure
 * that would tell the reader their session is still active.
 */
export async function revokeSession(): Promise<void> {
  try {
    await authApi.logout();
  } catch (error) {
    if (httpErrorStatus(error) !== 401) throw error;
  }
}

/** Sign out from a screen outside the account menu: revoke, then restart at sign-in. */
export async function signOut(queryClient: QueryClient): Promise<never> {
  await revokeSession();
  return restartAt(queryClient, '/login');
}

/**
 * End a session that predates the published Terms revision: the sign-in form
 * says why and asks for the decision on its required box. No consent screen
 * inside the app asks instead.
 */
export async function signOutForChangedTerms(queryClient: QueryClient): Promise<never> {
  await revokeSession();
  return restartAt(queryClient, `/login?error=${TERMS_CHANGED_CODE}`);
}
