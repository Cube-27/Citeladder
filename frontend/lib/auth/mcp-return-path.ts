/**
 * The MCP consent return path, validated.
 *
 * An MCP handoff sends an unauthenticated visitor to
 * `/login?return_to=/mcp/oauth/consent?transaction=…`, and that path has to
 * survive the whole auth journey — including the detour through registration
 * for a visitor who does not have an account yet. Both `/login` and
 * `/register` need the same rules, so they live here rather than in either
 * page.
 *
 * This is an open redirect guard: `return_to` arrives from the URL, so the
 * value is treated as hostile until proven to be the one internal path the
 * handoff is allowed to resume. Anything else answers `undefined`, and the
 * caller falls back to its normal post-auth routing.
 */

const CONSENT_PATH = '/mcp/oauth/consent';
const MAX_TRANSACTION_LENGTH = 256;

/** A sentinel origin: only paths that stay on it are same-origin and safe. */
const INTERNAL_ORIGIN = 'https://citeladder.invalid';

/**
 * The safe consent path to resume, or `undefined`.
 *
 * Rebuilt from the parsed parts rather than passed through, so only the
 * pathname and a single re-encoded `transaction` survive — no extra query
 * parameters and no fragment can ride along.
 */
export function safeMcpReturnPath(value: string | null): string | undefined {
  if (!value?.startsWith(`${CONSENT_PATH}?`)) return undefined;
  // `//host` is protocol-relative and would leave the site; a fragment cannot
  // reach the server and has no business in a resume path.
  if (value.startsWith('//') || value.includes('#')) return undefined;
  const parsed = new URL(value, INTERNAL_ORIGIN);
  if (parsed.origin !== INTERNAL_ORIGIN) return undefined;
  const transaction = parsed.searchParams.get('transaction');
  if (!transaction || transaction.length > MAX_TRANSACTION_LENGTH) return undefined;
  return `${parsed.pathname}?transaction=${encodeURIComponent(transaction)}`;
}

/**
 * Carry a validated `return_to` onto an internal auth destination.
 *
 * `destination` is a trusted literal from our own code (`/register`,
 * `/login?registered=1`); `returnTo` has already passed `safeMcpReturnPath`.
 */
export function withMcpReturnPath(destination: string, returnTo: string | undefined): string {
  if (!returnTo) return destination;
  const separator = destination.includes('?') ? '&' : '?';
  return `${destination}${separator}return_to=${encodeURIComponent(returnTo)}`;
}
