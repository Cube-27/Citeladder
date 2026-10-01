/** Cross-page terminal evaluations and final revisions share the caller's crawl lock. */
import { randomUUID } from 'node:crypto';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { insertEvaluations } from './analysis-rows.ts';
import { hreflangConflict, sitemapOrphan } from './analysis/finalize.ts';
import { crawlCoverage } from './coverage.ts';
import { canonicalResolution, fetchResolutions, resolutionSet } from './resolution-evidence.ts';
import { publishFinalPageAnalyses } from './terminal-analysis.ts';
import type { Crawl } from './task-fence.ts';
import { canonicalUrl, canonicalIdentity } from './url-identity.ts';

const excludedPaths = policy.site_health.page_analysis.acquisition.hard_exclusion_path_patterns.map(
  (pattern) => new RegExp(pattern),
);
function internalTargets(finalUrl: string, facts: Record<string, unknown>) {
  const anchors = record(facts.links).anchors;
  const result = new Set<string>();
  for (const value of Array.isArray(anchors) ? anchors : []) {
    const anchor = record(value);
    if (!anchor.is_internal) continue;
    const url = canonicalUrl(String(anchor.url ?? ''), finalUrl);
    if (url && !excludedPaths.some((pattern) => pattern.test(new URL(url).pathname)))
      result.add(url);
  }
  return [...result].sort();
}
const alternates = (facts: Record<string, unknown>) =>
  Array.isArray(facts.hreflang_alternates) ? facts.hreflang_alternates.map(record) : [];

export async function finalizeCrawlAnalyses(db: Database, crawl: Crawl) {
  const rows = await db
    .selectFrom('site_page_analyses as p')
    .innerJoin('site_fetch_artifacts as a', (join) =>
      join
        .onRef('a.id', '=', 'p.artifact_id')
        .onRef('a.workspace_id', '=', 'p.workspace_id')
        .onRef('a.crawl_id', '=', 'p.crawl_id'),
    )
    .innerJoin('site_urls as u', (join) =>
      join
        .onRef('u.id', '=', 'p.site_url_id')
        .onRef('u.workspace_id', '=', 'p.workspace_id')
        .onRef('u.project_id', '=', 'p.project_id'),
    )
    .select([
      'p.id',
      'p.site_url_id',
      'p.artifact_id',
      'u.url_hash',
      'a.final_url',
      'a.normalized_facts',
    ])
    .where('p.workspace_id', '=', crawl.workspace_id)
    .where('p.project_id', '=', crawl.project_id)
    .where('p.crawl_id', '=', crawl.id)
    .where('p.is_current', '=', true)
    .where('p.status', '=', 'completed')
    .where('p.finalized_at', 'is', null)
    .orderBy('a.id')
    .execute();
  if (!rows.length) return;
  const resolutions = await fetchResolutions(db, crawl);
  const pageAlternates = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const url = canonicalUrl(row.final_url);
    if (url && !pageAlternates.has(url))
      pageAlternates.set(url, alternates(record(row.normalized_facts)));
  }
  const manifest = record(record(crawl.site_facts).sitemap);
  const sitemapUrls = Array.isArray(manifest.urls) ? strings(manifest.urls) : null;
  const sitemapRows = await db
    .selectFrom('site_url_observations')
    .select('observed_url')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('project_id', '=', crawl.project_id)
    .where('crawl_id', '=', crawl.id)
    .where((eb) =>
      sitemapUrls
        ? eb('observed_url', '=', eb.fn.any(eb.val(sitemapUrls)))
        : eb('source_kind', '=', 'sitemap'),
    )
    .execute();
  const rootUrl = canonicalUrl(crawl.root_url);
  const rootHash = rootUrl ? canonicalIdentity(rootUrl).hash : '';
  const linked = new Set(
    rows.flatMap((row) => internalTargets(row.final_url, record(row.normalized_facts))),
  );
  const coverage = await crawlCoverage(db, crawl);
  for (const row of rows) {
    const facts = record(row.normalized_facts);
    const source = canonicalUrl(row.final_url);
    const declaredAlternates = source ? alternates(facts) : [];
    let checked = 0;
    let unchecked = 0;
    let limited = 0;
    const missing = new Set<string>();
    for (const alternate of declaredAlternates) {
      const raw = String(alternate.url ?? '');
      const target = canonicalUrl(raw);
      if (!target) {
        unchecked++;
        continue;
      }
      if (target === source) continue;
      if (resolutions.get(target)?.status === 429) {
        unchecked++;
        limited++;
        continue;
      }
      const returns = pageAlternates.get(target);
      if (!returns) {
        unchecked++;
        continue;
      }
      checked++;
      if (!returns.some((back) => canonicalUrl(String(back.url ?? '')) === source))
        missing.add(raw);
    }
    const declarations = strings(facts.canonical_declarations);
    if (!declarations.length && facts.canonical_url) declarations.push(String(facts.canonical_url));
    const evaluations = [
      hreflangConflict({
        alternateCount: declaredAlternates.length,
        checkedCount: checked,
        uncheckedCount: unchecked,
        missingReturnTags: [...missing],
        rateLimitedCount: limited,
      }),
      canonicalResolution(declarations, row.final_url, resolutions),
      resolutionSet(internalTargets(row.final_url, facts), resolutions),
    ];
    if (row.url_hash === rootHash) {
      const targets = [
        ...new Set(
          sitemapRows
            .map((item) => canonicalUrl(item.observed_url))
            .filter((url): url is string => url !== null),
        ),
      ].sort();
      const orphans = [
        ...new Set(
          sitemapRows
            .filter((item) => {
              const url = canonicalUrl(item.observed_url);
              return url && url !== rootUrl && !linked.has(url);
            })
            .map((item) => item.observed_url),
        ),
      ];
      evaluations.push(
        sitemapOrphan(sitemapRows.length, orphans, coverage.state),
        resolutionSet(targets, resolutions, true),
      );
    }
    const existing = await db
      .selectFrom('site_rule_evaluations')
      .select('rule_id')
      .where('workspace_id', '=', crawl.workspace_id)
      .where('analysis_id', '=', row.id)
      .where('source_architecture_id', 'is', null)
      .execute();
    const seen = new Set(existing.map((item) => item.rule_id));
    await insertEvaluations(
      db,
      crawl,
      row.id,
      row.site_url_id,
      row.artifact_id,
      evaluations
        .filter((evaluation) => !seen.has(evaluation.rule_id))
        .map((evaluation) => ({ ...evaluation, id: randomUUID() })),
    );
  }
  await publishFinalPageAnalyses(db, crawl);
}
