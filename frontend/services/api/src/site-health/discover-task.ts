/**
 * The `discover` task: acquire one page under the crawl's scope, extract its
 * in-scope links and bounded facts from one parse, and commit the artifact,
 * the URL's observation, the admitted frontier and the page's disposition
 * (document, canonical alias, or a page to analyze) with the task outcome.
 * Network I/O happens outside the transaction; the commit takes the runtime
 * lock before the crawl and task, and writes nothing if the lease or crawl
 * was lost meanwhile.
 */
import { randomUUID } from 'node:crypto';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import type { FetchedPage } from '../projects/safe-fetch.ts';
import type { SiteTask } from '../queue/task-queue.ts';
import {
  attribute,
  document,
  elements,
  textContent,
  type HtmlElement,
  type HtmlNode,
} from '../web-evidence/html.ts';
import { extractPageFacts, factSettings, type PageFacts } from './analysis/facts.ts';
import { writeArtifact, writeAttempts, type AttemptOutcome } from './analysis-rows.ts';
import { duplicateOf, markDuplicates } from './canonical-alias.ts';
import {
  admitCandidates,
  candidate,
  crawlScope,
  enqueueDiscoveredAnalysis,
  lockRuntime,
  markInventoryDocument,
  type Candidate,
} from './frontier.ts';
import { isBotBlock } from './page-fetch.ts';
import {
  Abandoned,
  ACTIVE_CRAWL,
  httpError,
  loadScope,
  lockRunningTask,
  markRunning,
  prepareTask,
  recordCrawlEvent,
  settleTask,
  type SiteTaskContext,
} from './site-task.ts';
import type { Crawl } from './task-fence.ts';
import { classifyUrlAdmission, hardExcluded, type Admission, type Scope } from './url-admission.ts';
import { canonicalIdentity } from './url-identity.ts';

const crawlPolicy = policy.site_health.crawl;
const acquisition = policy.site_health.page_analysis.acquisition;
const NON_NAVIGABLE = policy.site_health.page_analysis.facts.non_navigable_href_prefixes;
const TRACKING = new Set(policy.site_health.tracking_params);
const DOCUMENT_TYPES = new Set(crawlPolicy.document_media_types);

type DiscoveredLink = {
  admission: Admission & { url: string };
  ordinal: number;
  rewriteReason: string;
  rewriteVersion: string;
};

/** Repair a positively identified encoded tracking-query delimiter (`/p%3Futm_source%3Dx`). */
function rewriteHref(href: string) {
  const match = /%3f/iu.exec(href);
  if (href.includes('?') || !match) return null;
  const query = href
    .slice(match.index + 3)
    .replaceAll(/%3d/giu, '=')
    .replaceAll(/%26/giu, '&');
  const separator = query.indexOf('=');
  if (separator < 0 || !TRACKING.has(query.slice(0, separator).toLowerCase())) return null;
  return `${href.slice(0, match.index)}?${query}`;
}

/** Every anchor in document order, template content included: discovery reads the unpruned page. */
function* anchors(root: HtmlNode): Generator<HtmlElement> {
  for (const element of elements(root)) {
    if (element.tagName === 'a') yield element;
    if (element.tagName === 'template' && 'content' in element)
      yield* anchors((element as HtmlElement & { content: HtmlNode }).content);
  }
}

/** The page title and its bounded, canonical, in-scope links in document order. */
export function discoveryLinks(root: HtmlNode, baseUrl: string, scope: Scope, maxLinks: number) {
  const titleNode = elements(root, 'title').next().value;
  const title = titleNode ? textContent(titleNode).slice(0, 1024) : '';
  const links: DiscoveredLink[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors(root)) {
    if (links.length >= maxLinks) break;
    const link = admitHref(attribute(anchor, 'href').trim(), baseUrl, scope);
    if (!link || seen.has(link.admission.hash)) continue;
    seen.add(link.admission.hash);
    links.push({ ...link, ordinal: links.length });
  }
  return { title, links };
}

/** One href's admission under the crawl scope, or null when it names no admissible page. */
function admitHref(
  href: string,
  baseUrl: string,
  scope: Scope,
): Omit<DiscoveredLink, 'ordinal'> | null {
  const lowered = href.toLowerCase();
  if (!href || NON_NAVIGABLE.some((prefix) => lowered.startsWith(prefix))) return null;
  const rewritten = rewriteHref(href);
  let target = href;
  try {
    // A rewritten href is canonicalized first, which drops the repaired tracking query.
    if (rewritten) target = canonicalIdentity(rewritten, baseUrl).url;
  } catch {
    return null;
  }
  const admission = classifyUrlAdmission(target, { ...scope, base: baseUrl });
  if (!admission.accepted || !admission.url) return null;
  return {
    admission: { ...admission, url: admission.url },
    rewriteReason: rewritten ? crawlPolicy.link_rewrite.reason : '',
    rewriteVersion: rewritten ? crawlPolicy.link_rewrite.version : '',
  };
}

type Discovery = { title: string; links: DiscoveredLink[] };
type Outcome = AttemptOutcome & {
  page: FetchedPage | null;
  discovery: Discovery | null;
  facts: PageFacts | null;
  retryable: boolean;
  errorDetail: string;
};

async function acquire(ctx: SiteTaskContext, crawl: Crawl, task: SiteTask): Promise<Outcome> {
  const scope = crawlScope(crawl);
  const fetched = await ctx.fetcher.fetch(task.requested_url, {
    signal: ctx.signal,
    // Redirects may not leave the crawl's scope any more than links may.
    admit: scope.domain
      ? (hop) => classifyUrlAdmission(hop.href, scope).accepted
      : (hop) => !hardExcluded(hop),
    contentTypes: [...acquisition.html_content_types, ...crawlPolicy.document_media_types],
  });
  const empty = { page: null, discovery: null, facts: null };
  if (!fetched.ok)
    return {
      ...empty,
      succeeded: false,
      errorCode: fetched.code,
      errorDetail: fetched.detail,
      retryable: fetched.retryable,
      statusCode: null,
      latencyMs: fetched.latencyMs,
      calls: fetched.calls,
    };
  const { page } = fetched;
  const common = {
    page,
    statusCode: page.status,
    latencyMs: fetched.latencyMs,
    calls: fetched.calls,
  };
  const failure = isBotBlock(page)
    ? ([acquisition.error_codes.bot_blocked, false] as const)
    : httpError(page.status);
  if (failure)
    return {
      ...empty,
      ...common,
      succeeded: false,
      errorCode: failure[0],
      errorDetail: '',
      retryable: failure[1],
    };
  const success = { ...common, succeeded: true, errorCode: '', errorDetail: '', retryable: false };
  if (DOCUMENT_TYPES.has(page.contentType))
    return { ...success, discovery: { title: '', links: [] }, facts: null };
  const settings = factSettings();
  // Discovery reads every anchor of the whole document before fact extraction bounds it.
  const root = document(page.body, page.charset);
  const discovery = discoveryLinks(root, page.url, scope, settings.maxLinks);
  const facts = extractPageFacts(
    page.body,
    {
      finalUrl: page.url,
      contentType: page.contentType,
      charset: page.charset,
      statusCode: page.status,
      headers: page.headers,
      httpVersion: page.httpVersion,
      ttfbMs: page.ttfbMs,
      latencyMs: fetched.latencyMs,
      wireBytes: page.wireBytes,
      decodedBytes: page.body.length,
    },
    settings,
    root,
  );
  return { ...success, discovery, facts };
}

/**
 * The fetched URL's latest state. Written after admission, whose upsert of
 * the root's own candidate would otherwise reset it to `running`.
 */
async function refreshFetchedUrl(
  trx: Database,
  crawl: Crawl,
  task: SiteTask,
  page: FetchedPage,
  discovery: Discovery,
) {
  await trx
    .updateTable('site_urls')
    .set({
      latest_title: discovery.title,
      latest_content_type: page.contentType.slice(0, 128),
      last_seen_crawl_id: crawl.id,
      discovery_status: 'completed',
    })
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('url_hash', '=', canonicalIdentity(task.requested_url).hash)
    .execute();
}

/** The fetched URL's identity and its observation, before admission adds sparse ones. */
async function writeObservation(
  trx: Database,
  crawl: Crawl,
  task: SiteTask,
  page: FetchedPage,
  discovery: Discovery,
  artifactId: string,
) {
  const identity = canonicalIdentity(task.requested_url);
  const admission = classifyUrlAdmission(task.requested_url);
  const sourceKind = task.depth === 0 ? 'root' : 'link';
  const now = new Date();
  await trx
    .insertInto('site_urls')
    .values({
      id: randomUUID(),
      workspace_id: crawl.workspace_id,
      project_id: crawl.project_id,
      normalized_url: identity.url,
      url_hash: identity.hash,
      display_url: identity.url,
      host: new URL(identity.url).hostname.slice(0, 255),
      depth: task.depth,
      corpus_disposition: admission.disposition,
      disposition_reason: admission.dispositionReason,
      disposition_version: crawlPolicy.disposition_version,
      item_kind: admission.itemKind,
      discovery_status: 'running',
      latest_source_kind: sourceKind,
      latest_title: '',
      latest_content_type: '',
      first_seen_crawl_id: crawl.id,
      last_seen_crawl_id: crawl.id,
      first_seen_at: now,
      last_seen_at: now,
    })
    .onConflict((conflict) => conflict.columns(['project_id', 'url_hash']).doNothing())
    .execute();
  const url = await trx
    .selectFrom('site_urls')
    .select('id')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('url_hash', '=', identity.hash)
    .executeTakeFirst();
  if (!url) return;
  const rewrite = await trx
    .selectFrom('site_discovery_frontier')
    .where('workspace_id', '=', crawl.workspace_id)
    .select(['rewrite_reason', 'rewrite_version'])
    .where('crawl_id', '=', crawl.id)
    .where('url_hash', '=', task.url_hash)
    .executeTakeFirst();
  await trx
    .insertInto('site_url_observations')
    .values({
      id: randomUUID(),
      workspace_id: crawl.workspace_id,
      project_id: crawl.project_id,
      crawl_id: crawl.id,
      site_url_id: url.id,
      source_kind: sourceKind,
      parent_site_url_id: task.parent_site_url_id,
      source_artifact_id: artifactId,
      value_kind: admission.valueKind,
      value_priority: admission.priority,
      rewrite_reason: rewrite?.rewrite_reason ?? '',
      rewrite_version: rewrite?.rewrite_version ?? '',
      depth: task.depth,
      observed_url: task.requested_url,
      final_url: page.url,
      status_code: page.status,
      content_type: page.contentType.slice(0, 128),
      title: discovery.title,
      created_at: now,
    })
    .onConflict((conflict) => conflict.columns(['crawl_id', 'site_url_id']).doNothing())
    .execute();
}

/**
 * The page's links as frontier candidates. The root also admits itself: a
 * sample's allowance is filled from admitted identities, and the root has no
 * inventory row before its first fetch.
 */
function candidatesFor(task: SiteTask, discovery: Discovery, exact: boolean): Candidate[] {
  if (exact) return [];
  const links = discovery.links.map((link) =>
    candidate(link.admission, {
      url: link.admission.url,
      hash: link.admission.hash,
      depth: task.depth + 1,
      sourceKind: 'link',
      parentPosition: 0,
      linkOrdinal: link.ordinal,
      rewriteReason: link.rewriteReason,
      rewriteVersion: link.rewriteVersion,
    }),
  );
  if (task.depth !== 0) return links;
  const root = candidate(classifyUrlAdmission(task.requested_url), {
    url: task.requested_url,
    hash: canonicalIdentity(task.requested_url).hash,
    depth: 0,
    sourceKind: 'root',
    parentPosition: -1,
    linkOrdinal: -1,
  });
  return [...links, root];
}

/** A document is inventory, an alias of an active page is excluded, anything else is analyzed. */
async function dispose(
  trx: Database,
  crawl: Crawl,
  task: SiteTask,
  page: FetchedPage,
  facts: PageFacts | null,
) {
  const isDocument = DOCUMENT_TYPES.has(page.contentType);
  if (isDocument) await markInventoryDocument(trx, crawl, task.url_hash);
  const declared = typeof facts?.canonical_url === 'string' ? facts.canonical_url : '';
  const alias = await duplicateOf(trx, crawl, {
    hash: task.url_hash,
    declaredCanonical: declared,
    baseUrl: page.url || task.requested_url,
  });
  if (alias) await markDuplicates(trx, crawl, [task.url_hash]);
  else if (!isDocument)
    await enqueueDiscoveredAnalysis(trx, crawl, {
      siteUrlId: task.site_url_id,
      url: task.requested_url,
      hash: task.url_hash,
      depth: task.depth,
      priority: task.priority,
    });
}

async function persist(ctx: SiteTaskContext, claimed: SiteTask, outcome: Outcome) {
  ctx.signal?.throwIfAborted();
  await ctx.db
    .transaction()
    .execute(async (trx) => {
      const live = await loadScope(trx, claimed);
      if (live?.task.lease_owner !== ctx.owner) throw new Abandoned();
      const { crawl, task } = live;
      let artifactId: string | null = null;
      let admitted = 0;
      let sampleCapped = false;
      const { page, discovery } = outcome;
      if (page && discovery) {
        // First rung of the lock DAG, before any URL write or frontier admission.
        const runtime = await lockRuntime(trx, crawl.workspace_id);
        artifactId = await writeArtifact(trx, crawl, task, page, outcome.facts, {
          policyVersion: ctx.fetcher.settings.policyVersion,
          latencyMs: outcome.latencyMs ?? 0,
          purpose: 'discover',
        });
        await writeObservation(trx, crawl, task, page, discovery, artifactId);
        const exact = record(crawl.configuration).input_mode === 'exact_urls';
        const admission = await admitCandidates(
          trx,
          crawl,
          candidatesFor(task, discovery, exact),
          runtime,
          { enqueueChildren: !exact, sourceArtifactId: artifactId },
        );
        admitted = admission.admitted;
        sampleCapped = admission.sampleCapped;
        await refreshFetchedUrl(trx, crawl, task, page, discovery);
        await dispose(trx, crawl, task, page, outcome.facts);
      }
      const locked = await lockRunningTask(trx, claimed, ctx.owner);
      if (!locked || !ACTIVE_CRAWL.has(locked.crawl.status)) throw new Abandoned();
      if (artifactId) {
        await trx
          .updateTable('site_crawls')
          .set((eb) => ({
            admitted_url_count: eb('admitted_url_count', '+', admitted),
            discovered_url_count: eb('discovered_url_count', '+', 1),
            updated_at: new Date(),
            ...(sampleCapped &&
            ['running', 'sample_completed'].includes(locked.crawl.discovery_status)
              ? { discovery_status: 'sample_completed' }
              : {}),
          }))
          .where('id', '=', locked.crawl.id)
          .where('workspace_id', '=', locked.crawl.workspace_id)
          .execute();
        await recordCrawlEvent(trx, locked.crawl, 'discovery.progress', 'discovery progress', {
          admitted,
          depth: task.depth,
        });
      }
      await writeAttempts(
        trx,
        locked.crawl,
        locked.task,
        outcome,
        artifactId,
        ctx.fetcher.settings.policyVersion,
      );
      await settleTask(
        trx,
        ctx,
        locked.task,
        artifactId
          ? { succeeded: true, artifactId }
          : {
              succeeded: false,
              retryable: outcome.retryable,
              errorCode: outcome.errorCode,
              errorDetail: outcome.errorDetail,
            },
      );
    })
    .catch((error: unknown) => {
      if (!(error instanceof Abandoned)) throw error;
    });
}

export async function runDiscover(ctx: SiteTaskContext, claimed: SiteTask) {
  const scope = await prepareTask(ctx, claimed);
  if (!scope || !(await markRunning(ctx.db, scope.task, ctx.owner))) return;
  await persist(ctx, claimed, await acquire(ctx, scope.crawl, scope.task));
}
