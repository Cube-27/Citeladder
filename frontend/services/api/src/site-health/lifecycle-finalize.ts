/**
 * Cross-page terminal evaluations. `prepareFinalization` runs outside any
 * transaction: it keyset-reads the crawl's unfinalized analyses with only the
 * facts the cross-page rules read, and builds their shared context in memory.
 * The finalize task then judges and revises the pages in short batches.
 */
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { onlyOf } from '../lists.ts';
import { compareText, scalarText } from '../text-order.ts';
import {
  contentFingerprint,
  duplicateContent,
  duplicateMatches,
  type DuplicateComparison,
  type Fingerprint,
} from './analysis/duplicate-content.ts';
import {
  canonicalDeclarations,
  finalizeEvaluation,
  hreflangConflict,
  sitemapOrphan,
  sitemapPresent,
  sitemapValid,
} from './analysis/finalize.ts';
import type { RuleEvaluation } from './analysis/rules.ts';
import { crawlCoverage } from './coverage.ts';
import { linkTargetUrl } from './discovery-links.ts';
import { pageAnchors } from './link-graph.ts';
import {
  canonicalResolution,
  fetchResolutions,
  linkRedirects,
  redirectChains,
  resolutionSet,
  sitewideLinks,
  sitewideTargets,
  type CanonicalTarget,
  type LinkingPage,
  type Resolution,
} from './resolution-evidence.ts';
import type { Crawl } from './site-task.ts';
import { hardExcluded } from './url-admission.ts';
import { canonicalUrl, canonicalIdentity } from './url-identity.ts';

type Facts = Record<string, unknown>;
type Alternates = Map<string, Facts[]>;
const settings = policy.site_health.crawl.finalize;

const sorted = (values: Iterable<string>) => [...new Set(values)].sort(compareText);

/**
 * One graph edge per source and target. A URL admission refuses (an excluded
 * host such as `app.`, path, query or asset extension) is never fetched, so it
 * is never an edge nor a target the broken-link check waits on.
 */
function internalTargets(finalUrl: string, facts: Facts) {
  const result = new Set<string>();
  for (const { anchor } of pageAnchors(facts)) {
    if (!anchor.is_internal) continue;
    const url = linkTargetUrl(scalarText(anchor.url), finalUrl);
    if (url && !hardExcluded(new URL(url))) result.add(url);
  }
  return sorted(result);
}
/**
 * A page whose content was never observed (a client-rendered shell) shows no
 * links, so its link checks have nothing to judge: unknown, never a pass.
 */
function unobservedLinks(facts: Facts, links: string[]) {
  const extraction = record(facts.extraction);
  if (links.length || extraction.state !== 'unavailable') return null;
  const reason = scalarText(extraction.reason) || 'content_unobserved';
  return ['technical.broken_internal_link', 'technical.internal_link_redirect'].map((rule) =>
    finalizeEvaluation(rule, 'unknown', {
      reason,
      total_count: 0,
      checked_count: 0,
    }),
  );
}
const alternatesOf = (facts: Facts) =>
  Array.isArray(facts.hreflang_alternates) ? facts.hreflang_alternates.map(record) : [];

/** Cross-check one page's hreflang cluster against the pages this crawl analyzed. */
function hreflang(
  source: string | null,
  alternates: Facts[],
  pages: Alternates,
  resolutions: Map<string, Resolution>,
) {
  const declared = source ? alternates : [];
  const counts = { checked: 0, unchecked: 0, limited: 0 };
  const missing = new Set<string>();
  for (const alternate of declared) {
    const raw = scalarText(alternate.url);
    const target = canonicalUrl(raw);
    if (target === source) continue;
    const returns = target ? pages.get(target) : undefined;
    if (target && resolutions.get(target)?.status === 429) counts.limited++;
    if (!target || !returns || resolutions.get(target)?.status === 429) {
      counts.unchecked++;
      continue;
    }
    counts.checked++;
    if (!returns.some((back) => canonicalUrl(scalarText(back.url)) === source)) missing.add(raw);
  }
  return hreflangConflict({
    alternateCount: declared.length,
    checkedCount: counts.checked,
    uncheckedCount: counts.unchecked,
    missingReturnTags: [...missing],
    rateLimitedCount: counts.limited,
  });
}

/** The page's one declared canonical in identity form; null for none or a conflicting set. */
function declaredCanonical(finalUrl: string, facts: Facts) {
  const unique = [...new Set(canonicalDeclarations(facts).map((value) => value.trim()))];
  const only = onlyOf(unique.filter(Boolean));
  return only === undefined ? null : canonicalUrl(only, finalUrl);
}

/**
 * A page joins the duplicate comparison when it is a successful, indexable
 * page that names no other canonical: noindex and canonicalised copies have
 * already said which page should be indexed.
 */
function duplicateCandidate(
  url: string | null,
  finalUrl: string,
  facts: Facts,
): Fingerprint | { reason: string } {
  if (!url) return { reason: 'insufficient_evidence' };
  if (!facts.has_html) return { reason: 'no_html' };
  const status = Number(record(facts.delivery).status_code);
  if (!(status >= 200 && status < 300)) return { reason: 'unsuccessful_response' };
  if (record(facts.robots).noindex === true) return { reason: 'intentional_non_indexing' };
  const canonical = declaredCanonical(finalUrl, facts);
  if (canonical && canonical !== url) return { reason: 'canonicalized_elsewhere' };
  return (
    contentFingerprint(scalarText(facts.primary_content_text)) ?? {
      reason: 'thin_content',
    }
  );
}

/** What the cross-page rules keep of one analyzed page once its facts are dropped. */
function analyzedPage(finalUrl: string, facts: Facts) {
  const url = canonicalUrl(finalUrl);
  const links = internalTargets(finalUrl, facts);
  return {
    finalUrl,
    url,
    title: scalarText(facts.title),
    declarations: canonicalDeclarations(facts),
    alternates: alternatesOf(facts),
    target: {
      noindex: record(facts.robots).noindex === true,
      canonical: declaredCanonical(finalUrl, facts),
    } satisfies CanonicalTarget,
    links,
    unobserved: unobservedLinks(facts, links),
    candidate: duplicateCandidate(url, finalUrl, facts),
  };
}

/** Only the facts the cross-page rules read, and only for completed analyses. */
const ruleFacts = sql<unknown>`case when p.status = 'completed' then jsonb_build_object(
  'title', a.normalized_facts -> 'title',
  'canonical_declarations', a.normalized_facts -> 'canonical_declarations',
  'canonical_url', a.normalized_facts -> 'canonical_url',
  'robots', a.normalized_facts -> 'robots',
  'hreflang_alternates', a.normalized_facts -> 'hreflang_alternates',
  'links', a.normalized_facts -> 'links',
  'extraction', a.normalized_facts -> 'extraction',
  'has_html', a.normalized_facts -> 'has_html',
  'delivery', jsonb_build_object('status_code', a.normalized_facts -> 'delivery' -> 'status_code'),
  'primary_content_text', a.normalized_facts -> 'primary_content_text') end`;

/**
 * One keyset page of the crawl's current analyses. With `context`, finalized
 * ones too, with their rule facts: a resumed pass judges the pages still
 * pending against the whole crawl, as an uninterrupted one does.
 */
function currentAfter(db: Database, crawl: Crawl, after: string | null, context: boolean) {
  return db
    .selectFrom('site_page_analyses as p')
    .innerJoin('site_urls as u', (join) =>
      join
        .onRef('u.id', '=', 'p.site_url_id')
        .onRef('u.workspace_id', '=', 'p.workspace_id')
        .onRef('u.project_id', '=', 'p.project_id'),
    )
    .leftJoin('site_fetch_artifacts as a', (join) =>
      join
        .onRef('a.id', '=', 'p.artifact_id')
        .onRef('a.workspace_id', '=', 'p.workspace_id')
        .onRef('a.crawl_id', '=', 'p.crawl_id'),
    )
    .select([
      'p.id',
      'p.site_url_id',
      'p.artifact_id',
      'p.page_kind',
      'u.url_hash',
      'u.normalized_url',
      'a.final_url',
      sql<boolean>`p.finalized_at is null`.as('pending'),
      (context ? ruleFacts : sql<unknown>`null`).as('facts'),
    ])
    .where('p.workspace_id', '=', crawl.workspace_id)
    .where('p.project_id', '=', crawl.project_id)
    .where('p.crawl_id', '=', crawl.id)
    .where('p.is_current', '=', true)
    .$if(!context, (query) => query.where('p.finalized_at', 'is', null))
    .$if(after !== null, (query) => query.where('p.id', '>', after ?? ''))
    .orderBy('p.id')
    .limit(settings.read_pages)
    .execute();
}

type Current = Awaited<ReturnType<typeof currentAfter>>[number];
type Analyzed = Omit<Current, 'facts' | 'final_url'> & ReturnType<typeof analyzedPage>;

/** Every analyzed page's duplicate comparison, keyed by its identity URL. */
function duplicateComparisons(pages: Analyzed[]) {
  const fingerprints = new Map<string, Fingerprint>();
  const excluded = new Map<string, string>();
  for (const page of pages) {
    const url = page.url;
    if (!url || fingerprints.has(url) || excluded.has(url)) continue;
    if ('reason' in page.candidate) excluded.set(url, page.candidate.reason);
    else fingerprints.set(url, page.candidate);
  }
  const matches = duplicateMatches(fingerprints);
  return (url: string | null): DuplicateComparison => {
    const fingerprint = url ? fingerprints.get(url) : undefined;
    if (!url || !fingerprint)
      return {
        kind: 'excluded',
        reason: (url && excluded.get(url)) || 'insufficient_evidence',
      };
    return {
      kind: 'compared',
      words: fingerprint.words,
      compared: fingerprints.size - 1,
      matches: matches.get(url) ?? [],
    };
  };
}

/**
 * The sitemap URLs this crawl audits: the listed pages it tracks. An untracked
 * listed URL is never fetched, so it can neither pass nor fail these checks.
 */
async function sitemapObservations(db: Database, crawl: Crawl) {
  const rows = await db
    .selectFrom('site_sitemap_entries as e')
    .select('e.listed_url')
    .where('e.workspace_id', '=', crawl.workspace_id)
    .where('e.project_id', '=', crawl.project_id)
    .where('e.crawl_id', '=', crawl.id)
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom('site_crawl_tasks as t')
          .select('t.id')
          .whereRef('t.workspace_id', '=', 'e.workspace_id')
          .whereRef('t.crawl_id', '=', 'e.crawl_id')
          .whereRef('t.site_url_id', '=', 'e.site_url_id')
          .where('t.task_kind', '=', 'analyze'),
      ),
    )
    .execute();
  return rows.map((row) => row.listed_url);
}

/** The root page also carries the crawl-wide sitemap presence, orphan and reachability checks. */
async function rootEvaluations(
  db: Database,
  crawl: Crawl,
  linked: Set<string>,
  resolutions: Map<string, Resolution>,
) {
  const observed = await sitemapObservations(db, crawl);
  const rootUrl = canonicalUrl(crawl.root_url);
  const targets = sorted(observed.map((url) => canonicalUrl(url)).filter((url) => url !== null));
  const orphans = [
    ...new Set(
      observed.filter((url) => {
        const canonical = canonicalUrl(url);
        return canonical && canonical !== rootUrl && !linked.has(canonical);
      }),
    ),
  ];
  const coverage = await crawlCoverage(db, crawl);
  const sitemap = {
    sampleMode: crawl.sample_mode,
    sitemap: record(record(crawl.site_facts).sitemap),
  };
  return [
    sitemapPresent(sitemap),
    sitemapValid(sitemap),
    sitemapOrphan(observed.length, orphans, coverage.state),
    resolutionSet(targets, resolutions, { sitemap: true }),
    redirectChains(resolutions),
  ];
}

/** The pages linking each sitewide target, in URL order. */
function linkingPages(pages: Analyzed[], sitewide: ReadonlySet<string>) {
  const result = new Map<string, LinkingPage[]>();
  for (const page of pages)
    for (const target of page.links) {
      if (!sitewide.has(target)) continue;
      const linking: LinkingPage = {
        siteUrlId: page.site_url_id,
        url: page.normalized_url,
        title: page.title,
        pageKind: page.page_kind,
        artifactId: page.artifact_id,
      };
      const list = result.get(target);
      if (list) list.push(linking);
      else result.set(target, [linking]);
    }
  for (const list of result.values())
    list.sort((a, b) => compareText(a.url, b.url) || compareText(a.siteUrlId, b.siteUrlId));
  return result;
}

const rootHashOf = (crawl: Crawl) => {
  const url = canonicalUrl(crawl.root_url);
  return url ? canonicalIdentity(url).hash : '';
};

type PrepareOptions = { crossPage: boolean; retiring: ReadonlySet<string> };

/**
 * Keyset-read the pending pages, root first, leaving out the aliases about to
 * be retired, and with `crossPage` every current completed analysis's rule
 * facts, dropping each page's facts once read.
 */
async function readCurrent(db: Database, crawl: Crawl, options: PrepareOptions) {
  const rootHash = rootHashOf(crawl);
  const order: { id: string; root: boolean }[] = [];
  const analyzed: Analyzed[] = [];
  let after: string | null = null;
  let full = true;
  while (full) {
    const rows: Current[] = await currentAfter(db, crawl, after, options.crossPage); // NOSONAR -- Keyset pages, in order.
    for (const { facts, final_url: finalUrl, ...row } of rows) {
      after = row.id;
      if (options.retiring.has(row.url_hash)) continue;
      if (row.pending) order.push({ id: row.id, root: row.url_hash === rootHash });
      if (options.crossPage && facts !== null && finalUrl !== null)
        analyzed.push({ ...row, ...analyzedPage(finalUrl, record(facts)) });
    }
    full = rows.length === settings.read_pages;
  }
  const pendingIds = [...order.filter((row) => row.root), ...order.filter((row) => !row.root)].map(
    (row) => row.id,
  );
  return { rootHash, pendingIds, analyzed };
}

/**
 * Read the pages to finalize. With `crossPage`, also build the context each
 * pending completed page is judged from, out of every current completed
 * analysis (one a replayed pass already finalized included); a cancelled
 * crawl only appends final revisions.
 */
export async function prepareFinalization(db: Database, crawl: Crawl, options: PrepareOptions) {
  const { rootHash, pendingIds, analyzed } = await readCurrent(db, crawl, options);
  if (!analyzed.length) return { pendingIds, judge: (_id: string): Judged | null => null };
  // The first analyzed page of an identity URL, by artifact, speaks for it.
  analyzed.sort((a, b) => compareText(a.artifact_id, b.artifact_id) || compareText(a.id, b.id));
  const resolutions = await fetchResolutions(db, crawl);
  const pages: Alternates = new Map();
  const canonicalTargets = new Map<string, CanonicalTarget>();
  for (const page of analyzed) {
    if (!page.url || pages.has(page.url)) continue;
    pages.set(page.url, page.alternates);
    canonicalTargets.set(page.url, page.target);
  }
  const duplicates = duplicateComparisons(analyzed);
  const linked = new Set(analyzed.flatMap((page) => page.links));
  // Sitewide links are judged once, on the root; without the root in this crawl
  // every page keeps judging them itself. A root an earlier pass finalized
  // already holds its crawl-wide findings.
  const root = analyzed.find((page) => page.url_hash === rootHash);
  const sitewide = root ? sitewideTargets(analyzed.map((page) => page.links)) : new Set<string>();
  const rootExtras = root?.pending
    ? [
        ...(await rootEvaluations(db, crawl, linked, resolutions)),
        ...sitewideLinks(sitewide, linkingPages(analyzed, sitewide), resolutions),
      ]
    : [];
  const byId = new Map(analyzed.filter((page) => page.pending).map((page) => [page.id, page]));
  /** One pending analysis's crawl-finalize evaluations; null for one not completed. */
  const judge = (analysisId: string): Judged | null => {
    const page = byId.get(analysisId);
    if (!page) return null;
    return {
      siteUrlId: page.site_url_id,
      artifactId: page.artifact_id,
      evaluations: [
        hreflang(page.url, page.alternates, pages, resolutions),
        canonicalResolution(page.declarations, page.finalUrl, resolutions, canonicalTargets),
        ...(page.unobserved ?? [
          resolutionSet(page.links, resolutions, { sitewide }),
          linkRedirects(page.links, resolutions, sitewide),
        ]),
        duplicateContent(duplicates(page.url)),
        ...(page === root ? rootExtras : []),
      ],
    };
  };
  return { pendingIds, judge };
}

type Judged = {
  siteUrlId: string;
  artifactId: string;
  evaluations: RuleEvaluation[];
};

export type Finalization = Awaited<ReturnType<typeof prepareFinalization>>;
