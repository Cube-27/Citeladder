/**
 * The `site_setup` task, one per crawl: resolve robots and the AI-crawler
 * stance, probe llms.txt, walk the bounded sitemap tree, and admit its URLs.
 * It commits twice. The root analysis waits only on robots and llms.txt
 * evidence, so those publish first (with the sitemap marked pending); the
 * walk and its admission land in a second commit under the same lease. A
 * reclaimed task whose facts are published but still pending resumes at the walk.
 */
import { randomUUID } from 'node:crypto';

import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { SiteTask } from '../queue/task-queue.ts';
import { SitemapCollector, SitemapParseError } from '../web-evidence/sitemaps.ts';
import { admitCandidates, candidate, crawlScope, lockRuntime, type Candidate } from './frontier.ts';
import {
  Abandoned,
  ACTIVE_CRAWL,
  loadScope,
  lockRunningTask,
  markRunning,
  prepareTask,
  settleTask,
  type SiteTaskContext,
} from './site-task.ts';
import type { Crawl } from './task-fence.ts';
import { classifyUrlAdmission } from './url-admission.ts';
import { canonicalIdentity } from './url-identity.ts';

const crawlPolicy = policy.site_health.crawl;
const AI_CRAWLERS = policy.site_health.page_analysis.rules.ai_crawler_bots;
const DECLARED_SITEMAPS = 16;

export function setupSettings(env: Record<string, string | undefined> = process.env) {
  const spec = policy.site_health.settings;
  const number = (name: keyof typeof spec) => Number(resolveSettingSpec(spec[name], env));
  return {
    llmsBytes: number('llms_txt_max_decoded_bytes'),
    maxDocuments: number('max_sitemap_documents'),
    concurrency: Math.max(1, number('sitemap_fetch_concurrency')),
    maxAdmitted: number('max_sitemap_admitted_urls'),
    batch: Math.max(1, number('admission_batch_size')),
    sitemap: {
      maxDecodedBytes: number('max_sitemap_decoded_bytes'),
      maxUrls: number('max_sitemap_urls'),
      maxIndexDepth: number('max_sitemap_index_depth'),
    },
  };
}
type Settings = ReturnType<typeof setupSettings>;
type Robots = Awaited<ReturnType<SiteTaskContext['fetcher']['acquirer']['robots']>>;

/** How the robots.txt response reads in the dashboard: a missing file is not a failure. */
function robotsStatus(robots: Robots | null) {
  if (robots?.body != null) return 'fetched';
  const status = robots?.status ?? 0;
  if (status === 401 || status === 403) return 'access_blocked';
  // Unreachable, rate-limited, failing or unresolved redirects pause the crawl; other 4xx is a missing file.
  if (status < 400 || status === 429 || status >= 500) return 'fetch_failed';
  return 'not_found';
}

async function wellKnown(ctx: SiteTaskContext, url: string, settings: Settings) {
  const fetch = ctx.fetcher.settings.acquisition;
  try {
    return await ctx.fetcher.acquirer.fetch(url, {
      maxBytes: settings.llmsBytes,
      maxDecodedBytes: settings.llmsBytes,
      timeoutSeconds: fetch.timeout,
      redirects: fetch.redirects,
      contentTypes: ['*'],
    });
  } catch {
    return null;
  }
}

/** The facts the root analysis waits on; the sitemap section is dashboard evidence only. */
async function siteEvidence(
  ctx: SiteTaskContext,
  requested: string,
  origin: string,
  walks: boolean,
  settings: Settings,
) {
  const robots = origin ? await ctx.fetcher.acquirer.robots(origin) : null;
  const llmsUrl = origin ? `${origin}${crawlPolicy.llms_path}` : '';
  // A sample crawl ingests no sitemap, so it makes no llms.txt request it would not act on.
  const llms = { fetched: false, url: llmsUrl, status_code: null as number | null, present: false };
  if (walks && llmsUrl && robots?.permits(llmsUrl) !== false) {
    const page = await wellKnown(ctx, llmsUrl, settings);
    if (page) {
      llms.fetched = true;
      llms.status_code = page.status;
      llms.present =
        page.status >= 200 && page.status < 300 && page.body.toString('utf8').trim() !== '';
    }
  }
  return {
    robots: {
      fetched: robots?.body != null,
      status: robotsStatus(robots),
      url: origin ? `${origin}${crawlPolicy.robots_path}` : '',
      status_code: robots?.status || null,
      ai_crawlers: Object.fromEntries(
        AI_CRAWLERS.map((bot) => [
          bot,
          !robots || robots.allows(requested, bot) ? 'allow' : 'block',
        ]),
      ),
      crawler_roles: crawlPolicy.crawler_roles,
      sitemaps: (robots?.sitemaps ?? [])
        .slice(0, DECLARED_SITEMAPS)
        .map((url) => url.slice(0, 2048)),
    },
    llms_txt: llms,
    sitemap: { fetched: false, files: [] as string[], pending: walks },
  };
}
type SiteFacts = Record<string, unknown>;

async function sitemapDocument(ctx: SiteTaskContext, url: string, settings: Settings) {
  const fetch = ctx.fetcher.settings.acquisition;
  try {
    const page = await ctx.fetcher.acquirer.fetch(url, {
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
    return page.status >= 200 && page.status < 300 ? page : null;
  } catch {
    return null;
  }
}

/**
 * Walk the sitemap tree breadth-first in bounded concurrent waves, counting
 * attempts (not successes) against the document budget. Each wave is consumed
 * in queue order, so response timing cannot change which URLs fit the cap.
 */
async function walkSitemaps(
  ctx: SiteTaskContext,
  crawl: Crawl,
  seeds: string[],
  settings: Settings,
) {
  const collector = new SitemapCollector(settings.sitemap);
  const files: string[] = [];
  const queued = new Set(seeds);
  const queue = [...queued].map((url) => ({ url, depth: 0 }));
  let attempted = 0;
  while (queue.length && attempted < settings.maxDocuments) {
    // A full collector cannot gain a URL from any further document.
    if (collector.urls.length >= settings.sitemap.maxUrls) break;
    const wave = queue.splice(0, Math.min(settings.concurrency, settings.maxDocuments - attempted));
    attempted += wave.length;
    const pages = await Promise.all(wave.map(({ url }) => sitemapDocument(ctx, url, settings)));
    for (const [index, { url, depth }] of wave.entries()) {
      const page = pages[index];
      if (!page) continue;
      files.push(url);
      let refs: string[] = [];
      try {
        refs = collector.add(url, page.body, page.contentType, depth);
      } catch (error) {
        if (!(error instanceof SitemapParseError)) throw error;
      }
      for (const ref of refs)
        if (!queued.has(ref)) {
          queued.add(ref);
          queue.push({ url: ref, depth: depth + 1 });
        }
    }
  }
  const scope = crawlScope(crawl);
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of collector.urls) {
    if (urls.length >= settings.maxAdmitted) break;
    const admission = classifyUrlAdmission(raw, scope);
    if (!admission.accepted || !admission.url || seen.has(admission.hash)) continue;
    seen.add(admission.hash);
    urls.push(admission.url);
  }
  return { files: files.slice(0, settings.maxDocuments), urls };
}

/** Sitemap URLs as depth-1 candidates in sitemap document order. */
function sitemapCandidates(urls: string[]): Candidate[] {
  return urls.flatMap((url, ordinal) => {
    let identity: { url: string; hash: string };
    try {
      identity = canonicalIdentity(url);
    } catch {
      return [];
    }
    return [
      candidate(classifyUrlAdmission(identity.url), {
        url: identity.url,
        hash: identity.hash,
        depth: 1,
        sourceKind: 'sitemap',
        parentPosition: 0,
        linkOrdinal: ordinal,
      }),
    ];
  });
}

/**
 * Sparse observations so a sitemap-only URL is visible to the inventory
 * before its own discover task runs; a richer discovery observation wins.
 */
async function observeSitemapUrls(
  trx: Database,
  crawl: Crawl,
  candidates: Candidate[],
  siteUrlIds: Map<string, string>,
  settings: Settings,
) {
  const now = new Date();
  const rows = candidates.flatMap((item) => {
    const siteUrlId = siteUrlIds.get(item.hash);
    return siteUrlId
      ? [
          {
            id: randomUUID(),
            workspace_id: crawl.workspace_id,
            project_id: crawl.project_id,
            crawl_id: crawl.id,
            site_url_id: siteUrlId,
            source_kind: 'sitemap',
            value_kind: 'other',
            value_priority: 0,
            rewrite_reason: '',
            rewrite_version: '',
            depth: item.depth,
            observed_url: item.url,
            final_url: item.url,
            content_type: '',
            title: '',
            created_at: now,
          },
        ]
      : [];
  });
  for (let offset = 0; offset < rows.length; offset += settings.batch)
    await trx
      .insertInto('site_url_observations')
      .values(rows.slice(offset, offset + settings.batch))
      .onConflict((conflict) => conflict.columns(['crawl_id', 'site_url_id']).doNothing())
      .execute();
}

/** Run `body` inside a transaction that holds crawl and task; false when the lease or crawl was lost. */
async function underLease(
  ctx: SiteTaskContext,
  claimed: SiteTask,
  body: (trx: Database, crawl: Crawl, task: SiteTask) => Promise<void>,
) {
  return ctx.db
    .transaction()
    .execute(async (trx) => {
      const locked = await lockRunningTask(trx, claimed, ctx.owner);
      if (!locked || !ACTIVE_CRAWL.has(locked.crawl.status)) throw new Abandoned();
      await body(trx, locked.crawl, locked.task);
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof Abandoned) return false;
      throw error;
    });
}

/** The second commit: sitemap admission, the resolved facts and the task outcome. */
async function persist(
  ctx: SiteTaskContext,
  claimed: SiteTask,
  facts: SiteFacts,
  urls: string[],
  settings: Settings,
) {
  await ctx.db
    .transaction()
    .execute(async (trx) => {
      const live = await loadScope(trx, claimed);
      if (!live || live.task.lease_owner !== ctx.owner) throw new Abandoned();
      const { crawl } = live;
      let admitted = 0;
      const exact = record(crawl.configuration).input_mode === 'exact_urls';
      if (urls.length && !crawl.sample_mode && !exact) {
        const runtime = await lockRuntime(trx, crawl.workspace_id);
        const candidates = sitemapCandidates(urls);
        const admission = await admitCandidates(trx, crawl, candidates, runtime);
        await observeSitemapUrls(trx, crawl, candidates, admission.siteUrlIds, settings);
        admitted = admission.admitted;
      }
      const locked = await lockRunningTask(trx, claimed, ctx.owner);
      if (!locked || !ACTIVE_CRAWL.has(locked.crawl.status)) throw new Abandoned();
      const { pending: _pending, ...sitemap } = record(facts.sitemap);
      await trx
        .updateTable('site_crawls')
        .set((eb) => ({
          site_facts: JSON.stringify({ ...facts, sitemap }),
          admitted_url_count: eb('admitted_url_count', '+', admitted),
          updated_at: new Date(),
        }))
        .where('id', '=', locked.crawl.id)
        .where('workspace_id', '=', locked.crawl.workspace_id)
        .execute();
      await settleTask(trx, ctx, locked.task, { succeeded: true, artifactId: null });
    })
    .catch((error: unknown) => {
      if (!(error instanceof Abandoned)) throw error;
    });
}

export async function runSiteSetup(
  ctx: SiteTaskContext,
  claimed: SiteTask,
  settings = setupSettings(),
) {
  const scope = await prepareTask(ctx, claimed);
  if (!scope || !(await markRunning(ctx.db, scope.task, ctx.owner))) return;
  const { crawl, task } = scope;
  const published = crawl.site_facts === null ? null : record(crawl.site_facts);
  const resuming = record(published?.sitemap).pending === true;
  if (published && !resuming) {
    await underLease(ctx, claimed, (trx, _crawl, locked) =>
      settleTask(trx, ctx, locked, { succeeded: true, artifactId: null }),
    );
    return;
  }
  let origin = '';
  try {
    origin = new URL(task.requested_url).origin;
  } catch {
    origin = '';
  }
  const walks = Boolean(origin) && !crawl.sample_mode;
  let facts: SiteFacts;
  if (published) facts = published;
  else {
    facts = await siteEvidence(ctx, task.requested_url, origin, walks, settings);
    const evidence = facts;
    // Commit one: the root page's wait clears here, before the walk.
    const committed = await underLease(ctx, claimed, async (trx, locked) => {
      await trx
        .updateTable('site_crawls')
        .set({ site_facts: JSON.stringify(evidence), updated_at: new Date() })
        .where('id', '=', locked.id)
        .where('workspace_id', '=', locked.workspace_id)
        .execute();
    });
    if (!committed) return;
  }
  let urls: string[] = [];
  if (walks) {
    const declared = record(facts.robots).sitemaps;
    const seeds =
      Array.isArray(declared) && declared.length
        ? declared.filter((url): url is string => typeof url === 'string')
        : crawlPolicy.sitemap_default_paths.map((path) => `${origin}${path}`);
    const walk = await walkSitemaps(ctx, crawl, seeds, settings);
    urls = walk.urls;
    facts = { ...facts, sitemap: { fetched: walk.files.length > 0, files: walk.files, urls } };
  }
  await persist(ctx, claimed, facts, urls, settings);
}
