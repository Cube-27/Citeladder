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
 * navigation variant: one boolean and a link target. The failure mode of drift
 * is that a visitor sees "Log in" instead of "Dashboard" — self-correcting on
 * the next real page. The failure mode of validating is 449 KB on every
 * marketing visit. Anything that reads a FIELD off these responses belongs in
 * the validated client, not here.
 */
import { apiClient, type ApiRequestOptions } from './client';

/**
 * True when the caller holds a live session.
 *
 * Deliberately reduced to a boolean at the transport edge: it means no caller
 * can grow a dependency on an unvalidated user field, which is what would make
 * skipping `strictValidate` unsafe.
 */
export async function fetchMarketingSession(options?: ApiRequestOptions): Promise<boolean> {
  await apiClient.get<unknown>('/auth/me', options);
  return true;
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
