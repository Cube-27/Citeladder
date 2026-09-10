'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { fetchMarketingProjectCount, fetchMarketingSession } from '@/lib/api/marketing-session';
import { queryKeys } from '@/lib/api/query-keys';
import { ACTIVE_PROJECT_STORAGE_KEY } from '@/lib/project/active-project-storage';

import {
  RETURNING_VISITOR_ATTRIBUTE,
  clearSessionHintCookie,
  hasSessionHintCookie,
} from './returning-visitor-hint';

/**
 * Who is reading the marketing site, and what the nav should offer them.
 *
 * Split out of `nav.tsx` because it is not chrome: the dropdowns, the lens and
 * the mobile sheet are one concern, and "is there a session, and where should
 * Dashboard point" is another. The nav is the only consumer.
 */

const noStoredActiveProject = () => false;
const noSessionHint = () => false;
// The hint cookie is written by a page load, never during one: nothing to
// subscribe to, and `useSyncExternalStore` is here only for its server/client
// snapshot split.
const subscribeNothing = () => () => {};

function readStoredActiveProject(): boolean {
  try {
    return Boolean(window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY));
  } catch {
    return false;
  }
}

function subscribeToStoredActiveProject(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_PROJECT_STORAGE_KEY && event.storageArea === window.localStorage) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function useMarketingSession() {
  const hasStoredProject = useSyncExternalStore(
    subscribeToStoredActiveProject,
    readStoredActiveProject,
    noStoredActiveProject,
  );
  // Both queries go through `lib/api/marketing-session`, NOT the validated
  // `authApi` / `projectsApi`: those import the schema barrel, which put Zod
  // and every product schema (a measured 449 KB) into the marketing bundle to
  // answer two yes/no questions. See that module for why validation is the
  // right trade to drop here specifically.
  //
  // These use marketing-only cache keys. They hold a boolean and a count,
  // whereas `auth.me()` / `projects.list()` hold the validated user object and
  // project array that `SessionGuard` and `ProjectProvider` read fields off —
  // one `QueryClient` spans both surfaces with a 30-minute `gcTime`, so
  // sharing a key would hand the app shell the wrong shape on the first
  // navigation in from `/`.
  const me = useQuery({
    queryKey: queryKeys.auth.marketingSession(),
    queryFn: ({ signal }) => fetchMarketingSession({ signal }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const projects = useQuery({
    queryKey: queryKeys.projects.marketingCount(),
    queryFn: ({ signal }) => fetchMarketingProjectCount({ signal }),
    enabled: Boolean(me.data),
  });
  const hasProject = (projects.data ?? 0) > 0 || hasStoredProject;

  // Only once `me` has answered does React know what the actions row should
  // show, and only then may the pre-hydration mark go. Dropping it on mount
  // would hand the row back to CSS's anonymous default mid-flight — the exact
  // flash the mark exists to prevent.
  const sessionSettled = !me.isPending;
  const authenticated = Boolean(me.data);
  useEffect(() => {
    if (!sessionSettled) return;
    document.documentElement.removeAttribute(RETURNING_VISITOR_ATTRIBUTE);
    // A hint that survived a 401 stands for a session revoked before its
    // expiry (signed out in another tab, or `session_version` bumped). Left
    // alone it would paint "Dashboard" again on the next load and swap it for
    // "Log in" a moment later, which is the flicker this whole path exists to
    // remove. Expire it so that mistake is made at most once.
    if (!authenticated) clearSessionHintCookie();
  }, [sessionSettled, authenticated]);

  return {
    // Until `me` has settled (success or 401) we know nothing for certain about
    // the visitor, and rendering the anonymous actions during that window only
    // to swap in the dashboard link is the refresh flicker.
    //
    // Waiting on every visitor would cure that flicker by hiding the primary
    // CTA behind an auth round trip for the anonymous majority, who are the
    // people the marketing site exists for. So the placeholder is shown only
    // when this browser still holds the backend's session hint cookie, which
    // is where the swap would actually have happened. Everyone else gets
    // "Log in" and the demo CTA in the first paint.
    sessionPending: me.isPending,
    isAuthenticated: authenticated,
    dashboardHref: hasProject ? '/projects' : '/onboarding',
  };
}

/**
 * Whether this browser holds the backend's session hint, read only after mount.
 *
 * The marketing HTML is static and the server never sees the cookie, so a
 * render that branched on it would not match the markup React hydrates against.
 * The header covers that first paint in CSS instead (see `NavActions`); this is
 * for surfaces such as the mobile sheet that only ever exist post-hydration.
 */
export function useSessionHint(): boolean {
  return useSyncExternalStore(subscribeNothing, hasSessionHintCookie, noSessionHint);
}
