/**
 * Issue currency: whether a persisted issue is part of its crawl's present
 * state, kept on `site_issues.is_current`.
 *
 * A crawl's current issues are those whose evaluation a current page analysis
 * names in `source_evaluation_ids`, provisional or final, plus the crawl's
 * site-level architecture findings (CO-7: a running crawl shows its Issues as
 * they are found). The flag is kept per analysis by the writer that changes
 * it, in its transaction: an analysis written over an earlier one, a finalize
 * batch appending final revisions, a duplicate alias retiring analyses. Each
 * update reaches only the named analyses' issues, so no statement grows with
 * the crawl. Architecture findings are written current. The Issues reads then
 * filter one indexed flag instead of unnesting every current analysis's
 * evaluation list on every query.
 *
 * The flag is a derived projection: issues and evaluations stay as written, and
 * the analyses keep the exact evaluation ids the flag is computed from.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { persistIssueCatalog } from './issue-catalog.ts';
import { landIssueStates } from './issue-states.ts';
import { foldingSiteCrawl } from './reads/crawl.ts';
import { refreshSiteSnapshot } from './snapshot.ts';
import type { Crawl } from './site-task.ts';

/** Read per call, so a changed setting applies without a restart. */
const batchSize = () => policy.site_health.crawl.finalize.batch_pages;

/**
 * Recompute the flag for the issues of the named analyses (`site_issues.analysis_id`,
 * the analysis that first recorded them), writing only the rows that change.
 */
export async function syncIssueCurrency(db: Database, crawl: Crawl, analysisIds: string[]) {
  if (!analysisIds.length) return;
  await sql`
    with current_evaluation as (
      select unnest(a.source_evaluation_ids) as id from site_page_analyses a
      where a.workspace_id = ${crawl.workspace_id} and a.crawl_id = ${crawl.id} and a.is_current
        and coalesce(a.supersedes_analysis_id, a.id) = any(${analysisIds}::uuid[])
      union
      select e.id from site_rule_evaluations e
      join site_observed_architectures o
        on o.id = e.source_architecture_id and o.workspace_id = e.workspace_id
      where o.workspace_id = ${crawl.workspace_id} and o.crawl_id = ${crawl.id}
        and e.analysis_id = any(${analysisIds}::uuid[])
    ),
    currency as (
      select i.id, i.evaluation_id in (select id from current_evaluation) as current
      from site_issues i
      where i.workspace_id = ${crawl.workspace_id} and i.crawl_id = ${crawl.id}
        and i.analysis_id = any(${analysisIds}::uuid[])
    )
    update site_issues i set is_current = c.current
    from currency c
    where i.id = c.id and i.workspace_id = ${crawl.workspace_id} and i.crawl_id = ${crawl.id}
      and i.is_current is distinct from c.current`.execute(db);
}

/** Every analysis that recorded an issue of the crawl, in keyset batches. */
async function syncCrawlCurrency(db: Database, crawl: Crawl) {
  const size = batchSize();
  let after: string | null = null;
  for (;;) {
    const rows: { analysis_id: string }[] = await db // NOSONAR -- Keyset batches, in order.
      .selectFrom('site_issues')
      .select('analysis_id')
      .distinct()
      .where('workspace_id', '=', crawl.workspace_id)
      .where('crawl_id', '=', crawl.id)
      .$if(after !== null, (query) => query.where('analysis_id', '>', after ?? ''))
      .orderBy('analysis_id')
      .limit(size)
      .execute();
    await syncIssueCurrency(
      db,
      crawl,
      rows.map((row) => row.analysis_id),
    ); // NOSONAR -- Keyset batches, in order.
    const last = rows.at(-1);
    if (!last || rows.length < size) return;
    after = last.analysis_id;
  }
}

/**
 * Publish the crawl's issue set: its persisted catalog and, as the crawl's
 * audit, its issue states (`issue-states.ts`). A page rerun moves its page in
 * the site crawl that shows it (SH-B9): that crawl's catalog, snapshot and
 * score summary follow, in this transaction. `resync` first recomputes every
 * flag of the crawl, in batches, for writers that changed issues directly.
 */
export async function refreshIssueCurrency(
  db: Database,
  crawl: Crawl,
  { resync = true }: { resync?: boolean } = {},
): Promise<void> {
  if (resync) await syncCrawlCurrency(db, crawl);
  await persistIssueCatalog(db, crawl);
  await landIssueStates(db, crawl);
  const site = await foldingSiteCrawl(db, crawl);
  if (site) {
    await persistIssueCatalog(db, site);
    await refreshSiteSnapshot(db, site);
  }
}
