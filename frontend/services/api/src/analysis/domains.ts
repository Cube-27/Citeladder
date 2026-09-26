/**
 * Domain normalization and the grounding-redirect predicate.
 *
 * Ports of `app/analysis/normalization.py` (`normalize_domain`,
 * `domain_matches`) and `app/connectors/answer_engines/grounding_redirect.py`.
 * Python keeps both for the audit pipeline, so golden masters regenerated from
 * them hold this port to the same answers (TypeScript migration rule 2).
 */
import { pyStrip, pyStrOrEmpty } from '../python/text.ts';
import { hostname, PythonValueError, urlparsePath, urlsplit } from '../python/urlparse.ts';

const GOOGLE_REDIRECT_HOST = 'vertexaisearch.cloud.google.com';
const GROUNDING_REDIRECT_MARKER = 'grounding-api-redirect';

/**
 * Lowercase host without `www.`, from a bare domain, a URL or a domain-shaped
 * title. Throws `PythonValueError` where Python raises (a malformed IPv6 host).
 */
export function normalizeDomain(value: unknown): string {
  let text = pyStrip(pyStrOrEmpty(value)).toLowerCase();
  if (!text) return '';
  if (!text.includes('://')) text = `https://${text}`;
  const host = hostname(urlsplit(text)) ?? '';
  return host.startsWith('www.') ? host.slice('www.'.length) : host;
}

/** True if `candidate` equals `target` or is a subdomain of it. */
export function domainMatches(candidate: unknown, target: unknown): boolean {
  const left = normalizeDomain(candidate);
  const right = normalizeDomain(target);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`);
}

/** True when a URL is a grounding redirect token rather than a publisher URL. */
export function isGroundingRedirect(value: unknown): boolean {
  const raw = pyStrip(pyStrOrEmpty(value));
  if (!raw) return false;
  let host: string;
  let path: string;
  try {
    const parts = urlsplit(raw);
    host = (hostname(parts) ?? '').toLowerCase().replace(/\.+$/u, '');
    path = urlparsePath(parts);
  } catch (error) {
    if (error instanceof PythonValueError) return false;
    throw error;
  }
  if (host === GOOGLE_REDIRECT_HOST || host.endsWith(`.${GOOGLE_REDIRECT_HOST}`)) return true;
  if (host === GROUNDING_REDIRECT_MARKER) return true;
  return !host && path.toLowerCase().includes(GROUNDING_REDIRECT_MARKER);
}
