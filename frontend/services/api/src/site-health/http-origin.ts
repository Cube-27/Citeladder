/**
 * The `http://` origin probe, one request per crawl during site setup: does
 * the plain-HTTP root hand visitors to HTTPS? It goes through the crawl's own
 * acquirer, so robots.txt, pacing and SSRF rules apply as to any page.
 */
import type { FetchedPage } from '../safe-fetch.ts';
import { policy } from '../config.ts';
import { tlsCertificateCode } from './page-fetch.ts';
import { logFetchFailure } from './sitemap-walk.ts';
import type { SiteTaskContext } from './site-task.ts';

const limits = policy.site_health.page_analysis.facts.limits;
// The port refused or the host dropped the connection: nothing is served over HTTP.
const NOT_SERVED = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH']);

/** The plain-HTTP root of an HTTPS origin; null when the origin is not HTTPS. */
export function httpOriginUrl(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' ? `http://${url.host}/` : null;
  } catch {
    return null;
  }
}

/** What the probe observed, as the `site.http_origin` fact the rule reads. */
export function httpOriginFacts(
  url: string | null,
  observed: { kind: 'page'; page: FetchedPage } | { kind: 'error'; error: unknown },
) {
  if (!url) return { state: 'not_probed', reason: 'root_not_https' } as const;
  if (observed.kind === 'page') {
    const first = observed.page.redirectChain?.[0];
    return {
      state: 'answered',
      url,
      status_code: first ? first.status : observed.page.status,
      first_location: (first?.to ?? '').slice(0, limits.url_chars),
      final_url: observed.page.url.slice(0, limits.url_chars),
      final_status_code: observed.page.status,
    } as const;
  }
  const { error } = observed;
  const code = error instanceof Error && 'code' in error ? String(error.code) : '';
  if (NOT_SERVED.has(code)) return { state: 'unanswered', url, error_code: code } as const;
  const failure = tlsCertificateCode(error) ?? (code || 'fetch_failed');
  return {
    state: 'failed',
    url,
    error_code: failure.slice(0, limits.signal_detail_chars),
  } as const;
}

export async function probeHttpOrigin(ctx: SiteTaskContext, origin: string) {
  const url = httpOriginUrl(origin);
  if (!url) return httpOriginFacts(null, { kind: 'error', error: null });
  await ctx.checkAccess();
  const settings = ctx.fetcher.settings;
  const startedAt = performance.now();
  try {
    const page = await ctx.fetcher.acquirer.fetch(url, {
      signal: ctx.signal,
      maxBytes: settings.maxWireBytes,
      maxDecodedBytes: settings.maxDecodedBytes,
      timeoutSeconds: settings.acquisition.timeout,
      redirects: settings.acquisition.redirects,
      contentTypes: ['*'],
    });
    return httpOriginFacts(url, { kind: 'page', page });
  } catch (error) {
    logFetchFailure(ctx, 'http_origin', error, startedAt);
    return httpOriginFacts(url, { kind: 'error', error });
  }
}
