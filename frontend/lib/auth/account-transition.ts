import type { QueryClient } from '@tanstack/react-query';

import { authApi } from '@/lib/api/auth';
import { httpErrorStatus } from '@/lib/api/errors';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { clearActiveProjectSelection } from '@/lib/project/active-project-storage';

export const TERMS_CHANGED_CODE = 'terms_changed';

const departing = new WeakSet<QueryClient>();

export function isDeparting(queryClient: QueryClient): boolean {
  return departing.has(queryClient);
}

function discardWhenLeft(queryClient: QueryClient) {
  window.addEventListener('pagehide', () => queryClient.clear(), { once: true });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
  });
}

export async function restartAt(queryClient: QueryClient, path: string): Promise<never> {
  departing.add(queryClient);
  try {
    await queryClient.cancelQueries();
  } catch {}
  clearActiveProjectSelection();
  discardWhenLeft(queryClient);
  hardNavigate(path);
  return new Promise<never>(() => {});
}

export async function revokeSession(): Promise<void> {
  try {
    await authApi.logout();
  } catch (error) {
    if (httpErrorStatus(error) !== 401) throw error;
  }
}

export async function signOut(queryClient: QueryClient): Promise<never> {
  await revokeSession();
  return restartAt(queryClient, '/login');
}

export async function signOutForChangedTerms(queryClient: QueryClient): Promise<never> {
  await revokeSession();
  return restartAt(queryClient, `/login?error=${TERMS_CHANGED_CODE}`);
}
