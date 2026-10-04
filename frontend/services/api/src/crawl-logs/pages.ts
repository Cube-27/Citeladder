import { sql } from 'kysely';
import {
  aiTrafficPagesSchema,
  aiTrafficUrlSchema,
  type trafficLegSchema,
} from '@citeladder/contracts/ai-traffic';
import type { z } from 'zod';
import type { Database } from '../db/database.ts';
import { crawlSummary, crawlWindow, verificationFilter, type CrawlReadOptions } from './reads.ts';
import type { CrawlScope } from './state.ts';
import { pageDataset, pageSorts, aiBots, type JoinedPage, type PageOptions } from './pages-data.ts';
import { partitionQuality } from '../integrations/partitions.ts';
import { strings, record } from '../db/json.ts';
import { aiTraffic } from '../config/ai-traffic.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import {
  encodeKeysetCursor,
  decodeKeysetCursor,
  InvalidCursorError,
} from '../http/keyset-cursor.ts';
import { ApiError } from '../errors.ts';
import { inventoryCrawlIds } from '../site-health/reads/crawl.ts';
import { compareText } from '../text-order.ts';

type Leg = z.infer<typeof trafficLegSchema>;
export async function pageContext(db: Database, scope: CrawlScope, options: CrawlReadOptions = {}) {
  const w = crawlWindow(options);
  const [crawl, partitions, mapping, audits, snapshot] = await Promise.all([
    crawlSummary(db, scope, options),
    partitionQuality(db, { ...scope, ...w, start: w.start, end: w.end }, 'ga4_landing_daily'),
    db
      .selectFrom('integration_property_mappings')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('provider', '=', 'ga4')
      .where('status', '=', 'active')
      .executeTakeFirst(),
    db
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('status', '=', 'completed')
      .where('created_at', '>=', new Date(w.start))
      .where('created_at', '<', new Date(Date.parse(w.end) + 86400000))
      .limit(1)
      .executeTakeFirst(),
    db
      .selectFrom('ai_referrals_snapshots')
      .select('metrics')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('window_start', '<=', sql<Date>`${w.start}::date`)
      .where('window_end', '>=', sql<Date>`${w.end}::date`)
      .where('granularity', '=', 'day')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst(),
  ]);
  const saved = record(record(snapshot?.metrics).analytics_quality).ga4_landing_daily;
  const quality = partitions.map((q) => {
    const match = Array.isArray(saved) ? saved.find((v) => record(v).day === q.day) : null;
    const fresh =
      match &&
      JSON.stringify(strings(record(match).artifact_ids).sort(compareText)) ===
        JSON.stringify([...q.artifact_ids].sort(compareText));
    return {
      ...q,
      flags: q.revision !== null && !fresh ? [...q.flags, 'projection_pending'] : q.flags,
    };
  });
  return {
    crawl,
    quality,
    ga4Connected: !!mapping,
    citationsAvailable: !!audits,
    ga4Complete: quality.every(
      (q) => q.revision !== null && q.flags.length === 0 && q.reporting_timezone !== null,
    ),
    crawlComplete: ['complete', 'declared_complete'].includes(crawl.coverage),
  };
}
function pageRow(
  r: JoinedPage,
  context: Awaited<ReturnType<typeof pageContext>>,
  hasInventory: boolean,
) {
  const { crawl, quality } = context;
  const timezone = [
    ...new Set([
      ...(context.crawlComplete ? [crawl.reporting_timezone] : []),
      ...strings(r.crawl_timezones),
      ...strings(r.referral_timezones),
      ...quality.map((q) => q.reporting_timezone).filter((v): v is string => !!v),
    ]),
  ];
  const mismatch =
    timezone.length > 1 ||
    quality.some((q) => q.flags.includes('timezone_mismatch')) ||
    (r.requests !== null &&
      quality.some(
        (q) => q.reporting_timezone && q.reporting_timezone !== crawl.reporting_timezone,
      ));
  const leg = (
    value: number | null,
    available: boolean,
    connected: boolean,
    coverage: string | null,
    flags: string[] = [],
    comparable = true,
  ): Leg => {
    if (!comparable)
      return {
        state: 'non_comparable',
        value: flags.length && value === 0 ? null : value,
        coverage,
        reason: 'timezone_mismatch',
      };
    if (flags.length)
      return {
        state: 'flagged',
        value: value === 0 ? null : value,
        coverage,
        reason: [...new Set(flags)].join(', '),
      };
    if (value !== null && value > 0) return { state: 'value', value, coverage, reason: null };
    if (available) return { state: 'zero', value: 0, coverage, reason: null };
    return {
      state: connected ? (coverage === 'unknown' ? 'unknown' : 'unavailable') : 'not_connected',
      value: null,
      coverage,
      reason: connected ? 'incomplete_coverage' : null,
    };
  };
  const flags = [
    ...strings(r.analytics_quality),
    ...quality.flatMap((q) => q.flags).filter((f) => f !== 'unavailable'),
  ];
  return {
    url_hash: r.url_hash,
    canonical_url: r.canonical_url,
    display_path: r.display_path,
    folder: r.folder,
    resource_class: r.resource_class,
    crawl: leg(
      r.requests,
      context.crawlComplete,
      crawl.connection !== 'not_connected',
      crawl.coverage,
      [],
      !mismatch,
    ),
    referrals: leg(
      r.sessions,
      context.ga4Complete,
      context.ga4Connected,
      context.ga4Complete ? 'complete' : 'partial',
      flags,
      !mismatch,
    ),
    citations: leg(r.citations, context.citationsAvailable, context.citationsAvailable, null),
    findings: leg(r.findings, r.findings !== null, hasInventory, null),
    key_events:
      r.key_events === null
        ? context.ga4Complete
          ? 0
          : null
        : r.key_events === 0 && flags.length
          ? null
          : r.key_events,
    errors_4xx: r.errors_4xx ?? (context.crawlComplete ? 0 : null),
    errors_5xx: r.errors_5xx ?? (context.crawlComplete ? 0 : null),
    last_crawl: r.last_crawl,
  };
}
async function observedCoverage(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions,
  crawl: Awaited<ReturnType<typeof pageDataset>>['crawl'],
  complete: boolean,
) {
  const w = crawlWindow(options);
  const result = await sql<{
    known: number;
    observed: number;
  }>`with known as (select distinct u.url_hash from site_urls u
    join site_url_observations o on o.site_url_id=u.id and o.workspace_id=u.workspace_id and o.project_id=u.project_id
    where u.workspace_id=${scope.workspaceId}::uuid and u.project_id=${scope.projectId}::uuid and o.crawl_id=any(${crawl ? inventoryCrawlIds(crawl) : []}::uuid[]))
    select count(*)::integer as known,count(*) filter(where exists(select 1 from bot_activity_daily b where
      b.workspace_id=${scope.workspaceId}::uuid and b.project_id=${scope.projectId}::uuid and b.url_hash=known.url_hash
      and b.identity='exact' and b.reporting_date between ${w.start}::date and ${w.end}::date
      and b.verification=any(${verificationFilter(options.verification)}::text[]) and b.bot_id=any(${aiBots()}::text[])))::integer as observed from known`.execute(
    db,
  );
  const counts = result.rows[0]!;
  return {
    state: !crawl ? 'unavailable' : !complete ? 'unavailable' : counts.known ? 'value' : 'unknown',
    share: complete && counts.known ? counts.observed / counts.known : null,
    known_pages: counts.known,
    observed_pages: complete ? counts.observed : null,
    inventory_date: crawl?.completed_at?.toISOString() ?? null,
    inventory_complete: crawl?.inventory_complete ?? false,
    sample_mode: crawl?.sample_mode ?? false,
    label: 'Observed crawl coverage' as const,
  };
}
export async function pagesRead(db: Database, scope: CrawlScope, options: PageOptions = {}) {
  const w = crawlWindow(options),
    limit = options.limit ?? crawlLogs.default_page_size;
  if (!Number.isInteger(limit) || limit < 1 || limit > crawlLogs.max_page_size)
    throw new ApiError(422, 'Invalid page size');
  const { cursor, ...rest } = options,
    filters = { ...rest, ...w, limit, sort: options.sort ?? 'requests_desc' },
    endpoint = [scope.workspaceId, scope.projectId, 'pages'].join(':');
  let after: string[] = [];
  try {
    if (cursor) after = decodeKeysetCursor(cursor, endpoint, filters);
  } catch (e) {
    if (e instanceof InvalidCursorError) throw new ApiError(422, e.message);
    throw e;
  }
  let urlHashes: string[] | undefined;
  if (options.pattern) {
    const saved = await db
      .selectFrom('ai_traffic_insights')
      .select('patterns')
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('window_start', '=', sql<Date>`${w.start}::date`)
      .where('window_end', '=', sql<Date>`${w.end}::date`)
      .where('formula_version', '=', aiTraffic.formula_version)
      .executeTakeFirst();
    const patterns = Array.isArray(saved?.patterns) ? saved.patterns : [];
    const match = patterns.find(
      (r) => typeof r === 'object' && r !== null && 'pattern' in r && r.pattern === options.pattern,
    );
    urlHashes =
      match && typeof match === 'object' && 'url_hashes' in match ? strings(match.url_hashes) : [];
  }
  const [data, context] = await Promise.all([
    pageDataset(db, scope, { ...options, after, url_hashes: urlHashes }),
    pageContext(db, scope, options),
  ]);
  const items = data.rows.slice(0, limit).map((r) => pageRow(r, context, !!data.crawl));
  const last = data.rows[Math.min(data.rows.length, limit) - 1],
    sort = filters.sort as keyof typeof pageSorts;
  return aiTrafficPagesSchema.parse({
    window_start: w.start,
    window_end: w.end,
    items,
    next_cursor:
      data.rows.length > limit && last
        ? encodeKeysetCursor(endpoint, filters, [
            String(last[pageSorts[sort]] ?? -1),
            last.url_hash,
          ])
        : null,
    observed_crawl_coverage: await observedCoverage(
      db,
      scope,
      options,
      data.crawl,
      context.crawlComplete,
    ),
  });
}
export async function urlRead(
  db: Database,
  scope: CrawlScope,
  urlHash: string,
  options: CrawlReadOptions = {},
) {
  if (!/^[a-f0-9]{64}$/u.test(urlHash)) throw new ApiError(422, 'Invalid path hash');
  const w = crawlWindow(options),
    cap = aiTraffic.max_timeline_items;
  const [data, context, crawls, referrals, citations] = await Promise.all([
    pageDataset(db, scope, { ...options, url_hash: urlHash }),
    pageContext(db, scope, options),
    sql`select bot_id,to_char(min(first_seen_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as first_seen,
      to_char(max(last_seen_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as last_seen,sum(requests)::integer as requests,jsonb_agg(id) as source_rollup_ids
      from bot_activity_daily where workspace_id=${scope.workspaceId}::uuid and project_id=${scope.projectId}::uuid and url_hash=${urlHash}
      and reporting_date between ${w.start}::date and ${w.end}::date and verification=any(${verificationFilter(options.verification)}::text[]) group by bot_id limit ${cap + 1}`.execute(
      db,
    ),
    sql`select ai_source,to_char(min(reporting_date),'YYYY-MM-DD') as first_referral,sum(sessions)::integer as sessions,
      (select jsonb_agg(distinct metric_id) from ai_referral_landing_daily q,jsonb_array_elements_text(q.source_metric_row_ids) metric_id
        where q.workspace_id=${scope.workspaceId}::uuid and q.project_id=${scope.projectId}::uuid and q.url_hash=${urlHash}
        and q.ai_source=l.ai_source and q.reporting_date between ${w.start}::date and ${w.end}::date) as source_metric_row_ids from ai_referral_landing_daily l
      where workspace_id=${scope.workspaceId}::uuid and project_id=${scope.projectId}::uuid and url_hash=${urlHash}
      and reporting_date between ${w.start}::date and ${w.end}::date group by ai_source limit ${cap + 1}`.execute(
      db,
    ),
    sql`with selected_audits as (select distinct on (audit_scope) id from audits where workspace_id=${scope.workspaceId}::uuid
      and project_id=${scope.projectId}::uuid and status='completed' and created_at>=${w.start}::date and created_at<${w.end}::date+1
      order by audit_scope,created_at desc,id desc)
      select to_char(a.created_at at time zone 'UTC','YYYY-MM-DD') as date,c.id as citation_id,c.audit_id
      from citations c join audits a on a.id=c.audit_id and a.workspace_id=c.workspace_id where c.workspace_id=${scope.workspaceId}::uuid
      and a.project_id=${scope.projectId}::uuid and c.url_hash=${urlHash} and c.is_owned and a.status='completed'
      and a.id in(select id from selected_audits) order by a.created_at,c.id limit ${cap + 1}`.execute(
      db,
    ),
  ]);
  return aiTrafficUrlSchema.parse({
    page: data.rows[0] ? pageRow(data.rows[0], context, !!data.crawl) : null,
    window_start: w.start,
    window_end: w.end,
    crawls: crawls.rows.slice(0, cap),
    referrals: referrals.rows.slice(0, cap),
    citations: citations.rows.slice(0, cap),
    provenance: {
      crawl_id: data.crawl?.id ?? null,
      formula_version: aiTraffic.formula_version,
      bounded: [crawls, referrals, citations].some((r) => r.rows.length > cap),
    },
  });
}
