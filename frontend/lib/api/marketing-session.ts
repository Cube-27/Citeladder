/**
 * The two session reads the public marketing chrome makes — and nothing else.
 *
 * **Why this file exists rather than `authApi.me` / `projectsApi.listProjects`.**
 * Both of those validate through `lib/api/schemas`, a barrel that re-exports
 * every schema in the product (~2,600 lines of Zod across billing, audits,
 * visibility, opportunities…). Importing one function from it pulls the whole
 * barrel, and because `nav.tsx` is the marketing tree's client boundary, that
 * landed Zod plus every product schema — a 449 KB chunk, measured against the
 * production build — on `/`, `/pricing`, `/blog/*` and every other static
 * marketing page, to answer two questions: is anyone signed in, and do they
 * have a project.
 *
 * Marketing pages are the anonymous majority's first contact with the site and
 * are the ones judged on load time, so they get a transport-only path.
 *
 * **Why dropping validation is correct HERE and nowhere else.** `strictValidate`
 * exists to fail loud on backend contract drift (drift policy §6), which is the
 * right call when a response drives product behaviour. These two calls drive a
 * navigation variant: an account glyph and a link target. The failure mode of drift
 * is that a visitor sees "Log in" instead of "Dashboard" — self-correcting on
 * the next real page. The failure mode of validating is 449 KB on every
 * marketing visit.
 *
 * **The one field this reads, and why that is still safe.** The signed-in nav
 * shows an account menu, and that menu is addressed by who it belongs to. The
 * objection above is to the BARREL, not to validation as such: a hand-written
 * guard over a single string costs nothing to ship, so `email` is narrowed here
 * rather than trusted. Its drift mode is blank initials on a marketing page.
 * Anything that needs a field the guard below does not name belongs in the
 * validated client, not here.
 */
import { apiClient, type ApiRequestOptions } from './client';
import { ApiError } from './errors';

/** The only shape the public chrome may read off `me`. */
export type MarketingSessionUser = { email: string };

/**
 * Narrow `me` to the one field the marketing chrome renders.
 *
 * Everything the transport cannot vouch for is dropped at this edge, so no
 * caller downstream can grow a dependency on an unvalidated field by accident.
 * An absent or non-string email still means "signed in" — the session is what
 * `/auth/me` answering 200 establishes — it just leaves the initials empty.
 */
function readString(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null && key in source
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

function toMarketingSessionUser(value: unknown): MarketingSessionUser {
  // `/auth/me` answers `{ user: { … } }`, the same envelope `authApi.me` reads
  // `.user` off. Walking it by hand here rather than importing that schema is
  // the whole point of this module.
  const email = readString(readString(value, 'user'), 'email');
  return { email: typeof email === 'string' ? email : '' };
}

/**
 * The signed-in caller, or `null` when there is no live session.
 *
 * A 401 is the answer "nobody", not a failure: it is the expected response for
 * the anonymous majority whose hint cookie has outlived their session.
 */
export async function fetchMarketingSession(
  options?: ApiRequestOptions,
): Promise<MarketingSessionUser | null> {
  try {
    return toMarketingSessionUser(await apiClient.get<unknown>('/auth/me', options));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * End the session from the public chrome.
 *
 * The same `POST /auth/logout` the app's account menu calls, on the same
 * transport-only path as the reads above: revoking a cookie has no response
 * body worth validating. The caller owns what happens next — the hint cookie
 * and the navigation both belong to the chrome, not to the transport.
 */
export async function logoutMarketingSession(options?: ApiRequestOptions): Promise<void> {
  await apiClient.post<unknown>('/auth/logout', undefined, options);
}

/**
 * How many projects the caller has — the nav only compares this against zero to
 * choose between `/projects` and `/onboarding`.
 *
 * A non-array response counts as zero rather than throwing: an unusable answer
 * and an empty one lead to the same destination, and the marketing nav is not
 * the surface on which to surface a contract error.
 */
export async function fetchMarketingProjectCount(options?: ApiRequestOptions): Promise<number> {
  const res = await apiClient.get<unknown>('/projects', options);
  return Array.isArray(res) ? res.length : 0;
}
