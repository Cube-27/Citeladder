import { ScrollRestoration } from 'react-router-dom';

/**
 * The document scrolls. Positions are keyed by history entry, so only Back and
 * Forward restore one; every new navigation opens at the top. Tab and filter
 * writes keep the position through `preventScrollReset` in `url-state.ts`.
 */
export function AppScrollRestoration() {
  return <ScrollRestoration />;
}
