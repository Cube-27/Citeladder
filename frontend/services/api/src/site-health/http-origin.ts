/**
 * The `http://` origin probe, one request per crawl during site setup: does
 * the plain-HTTP root hand visitors to HTTPS? It goes through the crawl's own
 * acquirer, so robots.txt, pacing and SSRF rules apply as to any page.
 */
import type { FetchedPage } from '../safe-fetch.ts';
import { policy } from '../config.ts';
import { failureFacts } from '../logging.ts';
import { tlsCertificateCode } from './page-fetch.ts';
import { logFetchFailure } from './sitemap-walk.ts';
import type { SiteTaskContext } from './site-task.ts';

const limits = policy.site_health.page_analysis.facts.limits;
// Only a refused port proves nothing is served; a reset or unreachable host may be transient.
const NOT_SERVED = new Set(['ECONNREFUSED']);

/** The plain-HTTP root of an HTTPS origin; null when the origin is not HTTPS. */
export function httpOriginUrl(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' ? `http://${url.host}/` : null;
  } catch {
    return null;
  }
}

/** The code a failed probe keeps: a named certificate failure, else the error's own code. */
export const probeFailureCode = (error: unknown) =>
  tlsCertificateCode(error) ?? failureFacts(error).error_code ?? 'fetch_failed';

/** What the probe observed, as the `site.http_origin` fact the rule reads. */
export function httpOriginFacts(
  url: string | null,
  observed: { kind: 'page'; page: FetchedPage } | { kind: 'error'; code: string },
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
  const { code } = observed;
  if (NOT_SERVED.has(code)) return { state: 'unanswered', url, error_code: code } as const;
  return { state: 'failed', url, error_code: code.slice(0, limits.signal_detail_chars) } as const;
}

type ProbeContext = Pick<SiteTaskContext, 'checkAccess' | 'signal'> & {
  fetcher: Pick<SiteTaskContext['fetcher'], 'acquirer' | 'settings'>;
};

export async function probeHttpOrigin(ctx: ProbeContext, origin: string) {
  const url = httpOriginUrl(origin);
  if (!url) return httpOriginFacts(null, { kind: 'error', code: '' });
  await ctx.checkAccess();
  const { acquirer, settings } = ctx.fetcher;
  // robots.txt is the origin's first request; when it got no answer, the root would not be fetched.
  const robots = await acquirer.robots(new URL(url).origin);
  if (robots.failure) return httpOriginFacts(url, { kind: 'error', code: robots.failure });
  const startedAt = performance.now();
  try {
    const page = await acquirer.fetch(url, {
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
    return httpOriginFacts(url, { kind: 'error', code: probeFailureCode(error) });
  }
}
