import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { aiTrafficInsightsSchema } from '@citeladder/contracts/ai-traffic';
import type { z } from 'zod';
import type { Database } from '../db/database.ts';
import type { CrawlScope } from './state.ts';
import { crawlWindow, type CrawlReadOptions } from './reads.ts';
import { pageDataset, type JoinedPage } from './pages-data.ts';
import { pageContext } from './pages.ts';
import { aiTraffic } from '../config/ai-traffic.ts';
import { policy } from '../config.ts';
import { strings, record } from '../db/json.ts';
import { taskProject, type Executor } from '../workers/executor.ts';
import { isoDateText } from '../db/timestamps.ts';

type Pattern = z.infer<typeof aiTrafficInsightsSchema>['patterns'][number];
function comparable(rows: JoinedPage[], context: Awaited<ReturnType<typeof pageContext>>) {
  return rows.every(
    (r) =>
      new Set([
        ...strings(r.crawl_timezones),
        ...strings(r.referral_timezones),
        ...context.quality.map((q) => q.reporting_timezone).filter(Boolean),
      ]).size <= 1,
  );
}
export function insightPatterns(
  rows: JoinedPage[],
  context: Awaited<ReturnType<typeof pageContext>>,
  bounded = false,
) {
  const patterns: Pattern[] = [],
    ga4 = context.ga4Complete;
  const crawl = context.crawlComplete;
  const compatible = comparable(rows, context);
  const add = (
    pattern: Pattern['pattern'],
    items: JoinedPage[],
    copy: string,
    numbers: Pattern['numbers'],
  ) => {
    if (!items.length) return;
    patterns.push({
      pattern,
      url_hashes: items.slice(0, aiTraffic.max_pattern_pages).map((r) => r.url_hash),
      copy,
      numbers: { ...numbers, page_count: items.length },
      coverage: { crawl: context.crawl.coverage, ga4: ga4 ? 'complete' : 'incomplete' },
    });
  };
  if (crawl && ga4 && compatible) {
    const absent = rows.filter(
      (r) =>
        (r.verified_requests ?? 0) >= aiTraffic.min_verified_requests && (r.sessions ?? 0) === 0,
    );
    add(
      'crawled_without_referrals',
      absent,
      'Verified AI requests and no identifiable AI referrals co-occurred in this window.',
      { requests: absent.reduce((s, r) => s + (r.verified_requests ?? 0), 0) },
    );
  }
  if (crawl && ga4 && compatible) {
    const absent = rows.filter(
      (r) => (r.sessions ?? 0) >= aiTraffic.min_referral_sessions && (r.ai_requests ?? 0) === 0,
    );
    add(
      'referrals_without_recent_crawl',
      absent,
      'AI referrals co-occurred with no recognized AI requests in the complete available logs.',
      { sessions: absent.reduce((s, r) => s + (r.sessions ?? 0), 0) },
    );
  }
  if (crawl && ga4 && compatible) {
    const valuable = rows.filter(
      (r) =>
        Object.keys(record(r.verified_errors)).length > 0 &&
        ((r.sessions ?? 0) > 0 || (r.key_events ?? 0) > 0 || (r.citations ?? 0) > 0),
    );
    const codes: Record<string, number> = {};
    for (const r of valuable)
      for (const [code, count] of Object.entries(record(r.verified_errors)))
        if (typeof count === 'number')
          codes['status_' + code] = (codes['status_' + code] ?? 0) + count;
    add(
      'crawler_errors_on_valuable_pages',
      valuable,
      'Verified crawler errors co-occurred on pages with tracked citations, AI referrals or key events.',
      codes,
    );
  }
  if (ga4 && compatible && !bounded) {
    const sorted = rows
      .filter((r) => (r.key_events ?? 0) > 0)
      .sort(
        (a, b) => (b.key_events ?? 0) - (a.key_events ?? 0) || a.url_hash.localeCompare(b.url_hash),
      );
    const total = sorted.reduce((s, r) => s + (r.key_events ?? 0), 0),
      top = sorted.slice(0, aiTraffic.concentration_top_k),
      events = top.reduce((s, r) => s + (r.key_events ?? 0), 0);
    if (total > 0 && events / total >= aiTraffic.concentration_share)
      add(
        'key_event_concentration',
        top,
        'AI-referral key events were concentrated on these pages in the same window.',
        { key_events: events, total_key_events: total, share: events / total },
      );
  }
  return patterns;
}
export const refreshTrafficInsights: Executor = async (task, { db, checkCancelled }) => {
  const projectId = await taskProject(db, task),
    scope = { workspaceId: task.workspace_id, projectId };
  await db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${scope.workspaceId + ':' + projectId + ':ai-traffic-insights-publication'},0))`.execute(
      trx,
    );
    for (const range of Object.keys(policy.analytics.preset_range_days)) {
      await checkCancelled('AI Traffic insight window');
      await refreshInsightWindow(trx, scope, { range });
    }
  });
};
/** The worker's persisted derivation for one resolved window; called in its publication transaction. */
export async function refreshInsightWindow(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions,
) {
  const w = crawlWindow(options);
  const [data, context] = await Promise.all([
    pageDataset(db, scope, { ...options, dataset_limit: aiTraffic.max_timeline_items + 1 }),
    pageContext(db, scope, options),
  ]);
  const bounded = data.rows.length > aiTraffic.max_timeline_items;
  const rows = data.rows.slice(0, aiTraffic.max_timeline_items),
    patterns = insightPatterns(rows, context, bounded);
  const coverage = {
    crawl: context.crawl.coverage,
    ga4_complete: context.ga4Complete,
    notice: !comparable(rows, context)
      ? 'Reporting timezones are non-comparable. Patterns are unavailable.'
      : !context.crawlComplete || !context.ga4Complete
        ? 'Coverage is incomplete. Absence-based insights are unavailable.'
        : bounded
          ? 'Insights cover a bounded set of observed pages.'
          : null,
  };
  const provenance = {
    crawl_rollup_ids: rows.flatMap((r) => strings(r.crawl_ids)),
    landing_rollup_ids: rows.flatMap((r) => strings(r.landing_ids)),
    citation_ids: rows.flatMap((r) => strings(r.citation_ids)),
    audit_ids: [...new Set(rows.flatMap((r) => strings(r.audit_ids)))],
    crawl_id: data.crawl?.id ?? null,
    ga4_artifact_ids: context.quality.flatMap((q) => q.artifact_ids),
  };
  const content = {
    patterns: JSON.stringify(patterns),
    coverage: JSON.stringify(coverage),
    provenance: JSON.stringify(provenance),
    thresholds: JSON.stringify(aiTraffic),
    formula_version: aiTraffic.formula_version,
    created_at: new Date(),
  };
  await db
    .insertInto('ai_traffic_insights')
    .values({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      window_start: w.start,
      window_end: w.end,
      ...content,
    })
    .onConflict((c) => c.constraint('uq_ai_traffic_insights_window').doUpdateSet(content))
    .execute();
}
export async function insightsRead(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions = {},
) {
  const w = crawlWindow(options);
  const row = await db
    .selectFrom('ai_traffic_insights')
    .selectAll()
    .select([
      isoDateText(sql.ref('window_start')).as('start'),
      isoDateText(sql.ref('window_end')).as('end'),
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('window_start', '=', sql<Date>`${w.start}::date`)
    .where('window_end', '=', sql<Date>`${w.end}::date`)
    .where('formula_version', '=', aiTraffic.formula_version)
    .executeTakeFirst();
  return aiTrafficInsightsSchema.parse(
    row
      ? {
          snapshot_id: row.id,
          window_start: row.start,
          window_end: row.end,
          formula_version: row.formula_version,
          patterns: row.patterns,
          coverage: row.coverage,
        }
      : {
          snapshot_id: null,
          window_start: w.start,
          window_end: w.end,
          formula_version: aiTraffic.formula_version,
          patterns: [],
          coverage: {
            crawl: 'unknown',
            ga4_complete: false,
            notice: 'Insights are awaiting a persisted refresh.',
          },
        },
  );
}
