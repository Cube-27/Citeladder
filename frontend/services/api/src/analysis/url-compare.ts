/**
 * The canonical-vs-final URL comparison form, as
 * `app/analysis/site_health/indexing.normalized_url_for_compare` computes it.
 *
 * Python keeps its owner for Site Health; Action grouping keys pages by this
 * form, so the port is held to it by a live golden. Never crawler identity.
 */
import { policy } from '../config.ts';
import { pyStrip } from '../python/text.ts';
import { hostname, parseQsl, port, urlencode, urlsplit } from '../python/urlparse.ts';
import { casefold } from '../traffic/normalization.ts';

export function normalizedUrlForCompare(url: string): string {
  const text = pyStrip(url);
  try {
    const parts = urlsplit(text);
    const host = hostname(parts);
    const n = port(parts);
    if (!parts.scheme || !host) return text.toLowerCase();
    const defaultPort =
      (parts.scheme === 'http' && n === 80) || (parts.scheme === 'https' && n === 443);
    const authority = n !== null && !defaultPort ? `${host}:${n}` : host;
    const path = parts.path.replace(/\/+$/u, '') || '/';
    // Only the config-owned tracking set is dropped.
    const query = urlencode(
      parseQsl(parts.query).filter(
        ([key]) => !policy.opportunity.tracking_query_params.includes(casefold(key)),
      ),
    );
    return `${parts.scheme}://${authority}${path}${query ? `?${query}` : ''}`;
  } catch {
    return text.toLowerCase();
  }
}
