'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { PRICING_BYOK_DEFAULT_ON, PRICING_BYOK_QUERY_PARAM } from '@/lib/config/billing';

/** Subscribers to URL changes we make ourselves (replaceState fires no event). */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function readFromUrl(): boolean {
  const value = new URLSearchParams(window.location.search).get(PRICING_BYOK_QUERY_PARAM);
  if (value === '1') return true;
  if (value === '0') return false;
  return PRICING_BYOK_DEFAULT_ON;
}

/**
 * Credential-mode selection for the pricing page, with the URL as the store.
 *
 * The URL is the shareable state — `/pricing?byok=1` must land on the BYOK
 * view — so it is the source of truth rather than a mirror of React state.
 * `useSyncExternalStore` gives that directly: one snapshot read, a defined
 * server snapshot for the SSR pass, and no effect syncing two copies of the
 * same fact.
 *
 * Writes use `history.replaceState`, not `router.replace`: this is a display
 * mode, not a navigation the back button should have to step through, and a
 * router push would re-render the whole island on every toggle. Since
 * `replaceState` fires no event, subscribers are notified explicitly.
 * Unrelated query parameters and the hash are preserved.
 *
 * Defaults to BYOK in this release: `base_price` is the only measured,
 * available price, so the default has to be the mode that can show a number
 * and start a checkout.
 */
export function useByokPricing(): { byok: boolean; setByok: (next: boolean) => void } {
  const byok = useSyncExternalStore(subscribe, readFromUrl, () => PRICING_BYOK_DEFAULT_ON);

  const setByok = useCallback((next: boolean) => {
    const params = new URLSearchParams(window.location.search);
    // The default needs no parameter — shared links stay clean, and the
    // parameter stays meaningful when it IS present.
    if (next === PRICING_BYOK_DEFAULT_ON) params.delete(PRICING_BYOK_QUERY_PARAM);
    else params.set(PRICING_BYOK_QUERY_PARAM, next ? '1' : '0');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    for (const listener of listeners) listener();
  }, []);

  return { byok, setByok };
}
