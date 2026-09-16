'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type UrlCodec<T> = {
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null;
};

export type UrlHistory = 'push' | 'replace';

const BASE = 'https://citeladder.local';

function browserLocation(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * ONE subscription to the address bar, shared by every `useUrlState` in the tree.
 *
 * Each instance used to attach three window listeners and parse its own `URL`.
 * A screen like Site Health's issue catalog holds eleven of them and AI
 * Visibility holds seventeen — so a single filter click woke fifty-one
 * listeners and rebuilt seventeen `URL` objects to read seventeen strings out
 * of the same query. The snapshot below is computed once per change instead.
 *
 * `getSnapshot` returns a string deliberately: React compares snapshots by
 * identity, and a freshly parsed object would loop forever. The parse is cached
 * beside it and invalidated on the same beat.
 */
const listeners = new Set<() => void>();
let snapshot = browserLocation();
let parsedFor: string | null = null;
let parsedParams: URLSearchParams = new URLSearchParams();

function refresh(): void {
  const next = browserLocation();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** The current query, parsed once per distinct address rather than per reader. */
function currentParams(): URLSearchParams {
  if (parsedFor !== snapshot) {
    parsedParams = new URL(snapshot, BASE).searchParams;
    parsedFor = snapshot;
  }
  return parsedParams;
}

function attach(): void {
  window.addEventListener('popstate', refresh);
  window.addEventListener('hashchange', refresh);
}

function detach(): void {
  window.removeEventListener('popstate', refresh);
  window.removeEventListener('hashchange', refresh);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

function getSnapshot(): string {
  // Read through rather than trusting the cached value. The address can also
  // be changed by something that notifies nobody — a test setting up a deep
  // link, a `history.replaceState` in code that predates this module — and a
  // store that only updated on its own events would hand React the previous
  // page forever. Returning a string keeps this safe: React compares snapshots
  // with `Object.is`, so an equal string is the same snapshot, and only the
  // cached PARSE below is worth keying on identity.
  snapshot = browserLocation();
  return snapshot;
}

function getServerSnapshot(): string {
  return '/';
}

/**
 * The router this document is running, once it exists.
 *
 * Writing the address with `history.pushState` directly is invisible to React
 * Router — it only watches `popstate` — so `useLocation` and `useSearchParams`
 * went stale the moment a filter changed. Everything reading them downstream
 * then held the previous query: the agent sheet's route context, the sidebar's
 * destinations, the shell's canonical-URL rewrite. That last one is the
 * damaging case, because it rebuilds the address from what it can see and so
 * dropped the filters the reader had just set.
 *
 * Routing the write through the router keeps one owner of the address. The
 * fallback is for tests and for the marketing bundle, neither of which has one.
 */
type UrlStateRouter = {
  navigate: (to: string, options?: { replace?: boolean }) => unknown;
  subscribe: (listener: () => void) => () => void;
};

let activeRouter: UrlStateRouter | null = null;

export function setUrlStateRouter(router: UrlStateRouter | null): void {
  activeRouter = router;
  // The router navigates for its own reasons too — a sidebar click, the
  // shell's canonicalisation — and those must reach this store, or it would be
  // the stale one instead.
  router?.subscribe(() => refresh());
}

function commitUrl(href: string, history: UrlHistory): void {
  const current = new URL(window.location.href);
  const next = new URL(href, current);
  if (
    next.pathname === current.pathname &&
    next.hash === current.hash &&
    next.searchParams.toString() === current.searchParams.toString()
  )
    return;
  if (activeRouter) {
    activeRouter.navigate(href, { replace: history === 'replace' });
    return;
  }
  window.history[history === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', href);
  refresh();
}

/** Atomically change related URL-owned filters with one history entry. */
export function setUrlParams(
  values: Readonly<Record<string, string | null>>,
  history: UrlHistory = 'push',
) {
  const current = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) current.searchParams.delete(key);
    else current.searchParams.set(key, value);
  }
  const href = `${current.pathname}${current.search}${current.hash}`;
  commitUrl(href, history);
}

export function useUrlState<T>(
  key: string,
  codec: UrlCodec<T>,
  options: Readonly<{ history?: UrlHistory; clearKeys?: readonly string[] }> = {},
): readonly [T, (value: T, history?: UrlHistory) => void] {
  const location = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = useMemo(
    // `location` is not read here, but it is what makes this recompute: the
    // parse below is the shared cache, keyed on that same string.
    () => (void location, codec.parse(currentParams().get(key))),
    [codec, location, key],
  );

  const { history: historyOption, clearKeys } = options;
  const setValue = useCallback(
    (next: T, history = historyOption ?? 'push') => {
      const params = new URLSearchParams(currentParams());
      const encoded = codec.serialize(next);
      if (encoded === null) params.delete(key);
      else params.set(key, encoded);
      for (const ownedKey of clearKeys ?? []) params.delete(ownedKey);
      const { pathname, hash } = new URL(snapshot, BASE);
      const href = `${params.size ? `${pathname}?${params.toString()}` : pathname}${hash}`;
      commitUrl(href, history);
    },
    [codec, key, clearKeys, historyOption],
  );

  return [value, setValue] as const;
}

export function stringUrlCodec<T extends string>(allowed: readonly T[], fallback: T): UrlCodec<T> {
  return {
    parse: (raw) => (allowed.includes(raw as T) ? (raw as T) : fallback),
    serialize: (value) => (value === fallback ? null : value),
  };
}

export const optionalStringUrlCodec: UrlCodec<string | null> = {
  parse: (raw) => raw,
  serialize: (value) => value,
};
