/**
 * A full crawl's sitemap walk for `site_setup` (SH-B5): fetch and parse the
 * sitemap tree within its safety ceilings, and return the admissible URLs it
 * lists in the tracked set's stable order. It writes nothing.
 */
import { policy } from '../config.ts';
import { failureFacts, getLogger } from '../logging.ts';
import { FetchError } from '../safe-fetch.ts';
import {
  SitemapCollector,
  SitemapParseError,
  SitemapTooLargeError,
  sitemapRef,
  type SitemapDocument,
  type SitemapLimits,
} from '../web-evidence/sitemaps.ts';
import { InterpretationTimeoutError, parseSitemapAsync } from './analysis/off-thread.ts';
import { candidate, crawlScope, type Candidate } from './frontier.ts';
import type { Crawl, SiteTaskContext } from './site-task.ts';
import { trackedOrder } from './tracked-set.ts';
import { classifyUrlAdmission } from './url-admission.ts';

const crawlPolicy = policy.site_health.crawl;
const logger = getLogger('site_health.setup');

export type WalkSettings = {
  concurrency: number;
  maxDocuments: number;
  maxSiteUrls: number;
  sitemap: SitemapLimits;
};

/**
 * A best-effort site document could not be fetched. A stop of the lease or
 * the drain is not a fetch failure: the task's commit re-checks it.
 */
export function logFetchFailure(
  ctx: SiteTaskContext,
  phase: string,
  error: unknown,
  startedAt: number,
) {
  if (ctx.signal.aborted) return;
  logger.warning('site_health_document_fetch_failed', {
    phase,
    ...failureFacts(error),
    elapsed_ms: Math.round(performance.now() - startedAt),
  });
}

/** A rate limit, timeout or server error says nothing about whether the document exists. */
const unavailableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

/**
 * One sitemap document's read: its 2xx response; `absent` when the server
 * answered that it has none (a 4xx, or a response refused as no sitemap type);
 * `unread` when no answer settled it (no response, a timeout, a rate limit or
 * a server error), which is no evidence either way.
 */
type SitemapRead =
  | { kind: 'page'; page: Awaited<ReturnType<SiteTaskContext['fetcher']['acquirer']['fetch']>> }
  | { kind: 'absent' }
  | { kind: 'unread' };

async function sitemapDocument(
  ctx: SiteTaskContext,
  url: string,
  settings: WalkSettings,
): Promise<SitemapRead> {
  await ctx.checkAccess();
  const fetch = ctx.fetcher.settings.acquisition;
  const startedAt = performance.now();
  try {
    const page = await ctx.fetcher.acquirer.fetch(url, {
      signal: ctx.signal,
      maxBytes: settings.sitemap.maxDecodedBytes,
      maxDecodedBytes: settings.sitemap.maxDecodedBytes,
      timeoutSeconds: fetch.timeout,
      redirects: fetch.redirects,
      contentTypes: crawlPolicy.sitemap_content_types,
      // Sitemaps may live off-scope, but never at a non-content endpoint.
      admit: (hop) => {
        if (!classifyUrlAdmission(hop.href, { infrastructure: 'sitemap' }).accepted)
          throw new Error('sitemap URL rejected by admission policy');
      },
    });
    if (page.status >= 200 && page.status < 300) return { kind: 'page', page };
    return { kind: unavailableStatus(page.status) ? 'unread' : 'absent' };
  } catch (error) {
    // The walk counts the attempt against its budget and moves on to the next document.
    logFetchFailure(ctx, 'sitemap', error, startedAt);
    // A response that arrived and was refused (say, an HTML page) is the server's answer.
    const refused = error instanceof FetchError ? error.status : null;
    return { kind: refused !== null && !unavailableStatus(refused) ? 'absent' : 'unread' };
  }
}

/**
 * One sitemap document read and parsed off the event loop. A body that does
 * not parse is the server's answer that it serves no sitemap there (`absent`);
 * a parse that overran its time limit or a body over the byte cap settled
 * nothing (`unread`).
 */
type SitemapAnswer =
  | { kind: 'parsed'; document: SitemapDocument }
  | { kind: 'absent' }
  | { kind: 'unread' };

async function readSitemap(
  ctx: SiteTaskContext,
  url: string,
  settings: WalkSettings,
): Promise<SitemapAnswer> {
  const read = await sitemapDocument(ctx, url, settings);
  if (read.kind !== 'page') return read;
  try {
    const { body, contentType } = read.page;
    return {
      kind: 'parsed',
      document: await parseSitemapAsync(body, contentType, settings.sitemap),
    };
  } catch (error) {
    if (error instanceof SitemapTooLargeError) return { kind: 'unread' };
    if (error instanceof SitemapParseError) return { kind: 'absent' };
    if (error instanceof InterpretationTimeoutError) return { kind: 'unread' };
    throw error;
  }
}

/**
 * Walk the sitemap tree breadth-first in bounded concurrent waves, each
 * consumed in queue order, so response timing cannot change what fits. Index
 * entries are followed only on the crawl's own domain, and only the safety
 * ceilings (documents, site-wide URLs) stop the walk (SH-B5).
 */
export async function walkSitemaps(
  ctx: SiteTaskContext,
  crawl: Crawl,
  seeds: string[],
  settings: WalkSettings,
) {
  const scope = crawlScope(crawl);
  const walk: Walk = {
    collector: new SitemapCollector({
      limits: settings.sitemap,
      maxSiteUrls: settings.maxSiteUrls,
      follows: (ref) => classifyUrlAdmission(ref, { ...scope, infrastructure: 'sitemap' }).accepted,
    }),
    files: 0,
    queued: new Set(
      seeds.flatMap((seed) =>
        seed.length <= crawlPolicy.max_url_chars ? (sitemapRef(seed) ?? []) : [],
      ),
    ),
    queue: [],
    unread: 0,
  };
  walk.queue = [...walk.queued].map((url) => ({ url, depth: 0 }));
  let attempted = 0;
  // A full collector cannot gain a URL from any further document.
  while (
    walk.queue.length &&
    attempted < settings.maxDocuments &&
    walk.collector.urls.length < settings.maxSiteUrls
  ) {
    const wave = walk.queue.splice(
      0,
      Math.min(settings.concurrency, settings.maxDocuments - attempted),
    );
    attempted += wave.length;
    const pages = await Promise.all(wave.map(({ url }) => readSitemap(ctx, url, settings))); // NOSONAR -- Waves are bounded and sequential: a wave's references feed the next one.
    ctx.signal.throwIfAborted();
    for (const [index, entry] of wave.entries()) collect(walk, entry, pages[index]);
  }
  // A ceiling or a reference left unwalked makes the count a lower bound, as an unread document does.
  const limitReached = walk.queue.length > 0 || walk.collector.truncated;
  const complete = !limitReached && !walk.unread && walk.files > 0;
  return {
    fileCount: walk.files,
    complete,
    limitReached,
    unread: walk.unread,
    ...admittedUrls(walk.collector, crawl),
  };
}
export type SitemapWalk = Awaited<ReturnType<typeof walkSitemaps>>;

type Walk = {
  collector: SitemapCollector;
  /** How many documents were read as sitemaps. */
  files: number;
  queued: Set<string>;
  queue: { url: string; depth: number }[];
  /** Documents no answer settled: unfetched, timed out, rate-limited or failing. */
  unread: number;
};

/** Record one answer and queue its unseen child references. */
function collect(walk: Walk, { url, depth }: { url: string; depth: number }, read?: SitemapAnswer) {
  if (read?.kind !== 'parsed') {
    if (read?.kind !== 'absent') walk.unread++;
    return;
  }
  const refs = walk.collector.add(url, read.document, depth);
  walk.files++;
  for (const ref of refs.filter((item) => !walk.queued.has(item))) {
    walk.queued.add(ref);
    walk.queue.push({ url: ref, depth: depth + 1 });
  }
}

/** A listed URL as a tracked-set candidate, with its first declared `<lastmod>`. */
export type SitemapUrl = { item: Candidate; lastmod: string | null };

/**
 * Every collected URL that passes the crawl's admission, canonical and unique,
 * in the tracked set's stable order. Their count is the crawl's discovered count.
 */
function admittedUrls(collector: SitemapCollector, crawl: Crawl) {
  const scope = crawlScope(crawl);
  const found = new Map<string, SitemapUrl>();
  for (const raw of collector.urls) {
    const admission = classifyUrlAdmission(raw, scope);
    if (!admission.accepted || !admission.url || found.has(admission.hash)) continue;
    found.set(admission.hash, {
      item: candidate(admission, {
        url: admission.url,
        hash: admission.hash,
        depth: 1,
        sourceKind: 'sitemap',
        parentPosition: 0,
        linkOrdinal: found.size,
      }),
      lastmod: collector.lastmod.get(raw) ?? null,
    });
  }
  const listed = [...found.values()].toSorted((a, b) => trackedOrder(a.item, b.item));
  return { discovered: found.size, listed };
}
