/**
 * One persisted page row per URL a crawl can show, filtered and keyset-paged
 * in a single query.
 *
 * A crawl shows the URLs it observed plus, for a full recrawl, the frozen
 * inventory of the crawls it inherits. Measurements, the analyze task and the
 * link metrics always come from the crawl itself, so an inherited URL reads
 * as not selected rather than borrowing older evidence. The presentation
 * status is derived in SQL, so status filters page like any other filter.
 */
import { sql, type RawBuilder } from 'kysely';

import { policy } from '../../config.ts';
import type { Database } from '../../db/database.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../../http/keyset-cursor.ts';
import { parseUuid } from '../../http/uuid.ts';
import { inventoryCrawlIds, isTerminal, type Crawl } from './crawl.ts';

const reads = policy.site_health.reads;
const PERSISTED = ['completed', 'partially_completed'];
// The largest integer depth; an unmeasured page sorts after every measured one.
const UNMEASURED_DEPTH = 2_147_483_647;

export const PAGE_SORTS = ['status', 'url', 'inbound', 'main_content_inbound', 'depth'] as const;
export type PageSort = (typeof PAGE_SORTS)[number];

type SortSpec = { value: RawBuilder<unknown>; kind: 'text' | 'int'; descending: boolean };

const SORTS: Record<PageSort, SortSpec> = {
  // Measured pages first, then the rest, each by URL.
  status: {
    value: sql`(case when a.status = any(${PERSISTED}::text[]) then '0:' else '1:' end) || u.normalized_url`,
    kind: 'text',
    descending: false,
  },
  url: { value: sql`u.normalized_url`, kind: 'text', descending: false },
  inbound: { value: sql`coalesce(l.inbound_count, 0)`, kind: 'int', descending: true },
  main_content_inbound: {
    value: sql`coalesce(l.main_content_inbound_count, 0)`,
    kind: 'int',
    descending: true,
  },
  depth: {
    value: sql`coalesce(l.depth_from_home, ${UNMEASURED_DEPTH})`,
    kind: 'int',
    descending: false,
  },
};

export type PageRowFilters = {
  /** A presentation status, or `error_or_blocked` for both terminal failures. */
  status?: string | null;
  monitored?: boolean | null;
  pageKind?: string | null;
  /** Case-insensitive substring of the normalized or display URL. */
  query?: string | null;
  siteUrlId?: string;
};

export type PageRow = {
  site_url_id: string;
  crawl_id: string;
  normalized_url: string;
  display_url: string;
  title: string | null;
  content_type: string | null;
  source: string | null;
  depth: number | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
  monitored: boolean;
  analysis_id: string | null;
  analysis_status: string;
  error_code: string;
  page_kind: string | null;
  web_fundamentals_score: number | null;
  web_fundamentals_coverage: number | null;
  web_fundamentals_state: string;
  aeo_readiness_score: number | null;
  aeo_measurement_coverage: number | null;
  aeo_measurement_state: string;
  aeo_measurement_reason: string;
  main_content_indexable: boolean | null;
  finalized_at: Date | null;
  issue_count: number | null;
  inbound_count: number | null;
  main_content_inbound_count: number | null;
  depth_from_home: number | null;
  sort_value: string | number;
};

/** The measurement fields every page projection carries; unmeasured without an analysis. */
export const measurementFields = (row: PageRow) => ({
  page_kind: row.page_kind,
  web_fundamentals_score: row.web_fundamentals_score,
  web_fundamentals_coverage: row.web_fundamentals_coverage,
  web_fundamentals_state: row.web_fundamentals_state,
  aeo_readiness_score: row.aeo_readiness_score,
  aeo_measurement_coverage: row.aeo_measurement_coverage,
  aeo_measurement_state: row.aeo_measurement_state,
  aeo_measurement_reason: row.aeo_measurement_reason,
  main_content_indexable: row.main_content_indexable,
  last_audited: row.finalized_at?.toISOString() ?? null,
  issue_count: row.issue_count,
});

/**
 * Issues of a page's current analysis: its own evaluations plus the
 * architecture findings attached to it.
 */
export const currentIssueFilter = (issue: string, analysis: string) =>
  sql`(${sql.ref(`${issue}.evaluation_id`)} = any(${sql.ref(`${analysis}.source_evaluation_ids`)})
    or (${sql.ref(`${issue}.analysis_id`)} = ${sql.ref(`${analysis}.id`)} and exists(
      select 1 from site_rule_evaluations e
      where e.id = ${sql.ref(`${issue}.evaluation_id`)} and e.source_architecture_id is not null)))`;

function statusFilter(status: string | null | undefined) {
  if (!status) return sql``;
  if (status === 'error_or_blocked') return sql`and analysis_status in ('error', 'blocked')`;
  return sql`and analysis_status = ${status}`;
}

/** Rows of the crawl's page window, `limit + 1` of them so the caller can see a next page. */
export async function pageRows(
  db: Database,
  crawl: Crawl,
  options: {
    filters: PageRowFilters;
    sort: PageSort;
    limit: number;
    after?: { value: string; id: string } | null;
  },
): Promise<PageRow[]> {
  const { filters, sort, limit, after } = options;
  const spec = SORTS[sort];
  const lineage = inventoryCrawlIds(crawl);
  const unmonitoredStatus = isTerminal(crawl) ? 'not_measured' : 'pending';
  const search = filters.query?.trim().toLowerCase();
  const pattern = search ? `%${search.replaceAll(/[\\%_]/gu, (c) => `\\${c}`)}%` : null;
  let keyset = sql``;
  if (after) {
    const value =
      spec.kind === 'int' ? sql`${Number(after.value)}::int` : sql`${after.value}::text`;
    keyset = spec.descending
      ? sql`and (sort_value, site_url_id) < (${value}, ${after.id}::uuid)`
      : sql`and (sort_value, site_url_id) > (${value}, ${after.id}::uuid)`;
  }
  const direction = sql.raw(spec.descending ? 'desc' : 'asc');
  const result = await sql<PageRow>`
    with projected as (
      select
        u.id as site_url_id,
        coalesce((
          select o.crawl_id from site_url_observations o
          where o.workspace_id = u.workspace_id and o.site_url_id = u.id
            and o.crawl_id = any(${lineage}::uuid[])
          order by array_position(${lineage}::uuid[], o.crawl_id) limit 1
        ), ${crawl.id}::uuid) as crawl_id,
        u.normalized_url,
        coalesce(nullif(u.display_url, ''), u.normalized_url) as display_url,
        nullif(u.latest_title, '') as title,
        nullif(u.latest_content_type, '') as content_type,
        nullif(u.latest_source_kind, '') as source,
        u.depth,
        u.first_seen_at,
        u.last_seen_at,
        m.site_url_id is not null as monitored,
        a.id as analysis_id,
        case
          when a.status = any(${PERSISTED}::text[]) then a.status
          when t.status is null then
            case when m.site_url_id is not null then ${unmonitoredStatus} else 'not_selected' end
          when t.status = 'cancelled' then 'cancelled'
          when t.status = 'failed' then
            case when t.error_code = any(${reads.policy_blocking_error_codes}::text[])
              then 'blocked' else 'error' end
          when t.status in ('running', 'leased') then 'running'
          else 'pending'
        end as analysis_status,
        case
          when a.status = any(${PERSISTED}::text[]) then ''
          when t.status in ('cancelled', 'failed') then coalesce(t.error_code, '')
          else ''
        end as error_code,
        a.page_kind,
        a.web_fundamentals_score,
        a.web_fundamentals_coverage,
        coalesce(a.web_fundamentals_state, 'not_measured') as web_fundamentals_state,
        a.aeo_readiness_score,
        a.aeo_measurement_coverage,
        coalesce(a.aeo_measurement_state, 'not_measured') as aeo_measurement_state,
        coalesce(a.aeo_measurement_reason, '') as aeo_measurement_reason,
        a.main_content_indexable,
        a.finalized_at,
        case when a.id is null then null else (
          select count(*)::int from site_issues i
          where i.workspace_id = u.workspace_id and i.crawl_id = ${crawl.id}
            and i.site_url_id = u.id and ${currentIssueFilter('i', 'a')}
        ) end as issue_count,
        l.inbound_count,
        l.main_content_inbound_count,
        l.depth_from_home,
        ${spec.value} as sort_value
      from site_urls u
      left join monitored_site_urls m
        on m.workspace_id = u.workspace_id and m.project_id = u.project_id
        and m.site_url_id = u.id and m.active
      left join lateral (
        select * from site_page_analyses a
        where a.workspace_id = u.workspace_id and a.crawl_id = ${crawl.id}
          and a.site_url_id = u.id and a.is_current
        order by a.created_at desc, a.id desc limit 1
      ) a on true
      left join lateral (
        select t.status, t.error_code from site_crawl_tasks t
        where t.workspace_id = u.workspace_id and t.crawl_id = ${crawl.id}
          and t.task_kind = 'analyze' and t.site_url_id = u.id
        order by t.generation desc, t.created_at desc limit 1
      ) t on true
      left join site_page_link_metrics l
        on l.workspace_id = u.workspace_id and l.project_id = u.project_id
        and l.crawl_id = ${crawl.id} and l.site_url_id = u.id
        and l.extractor_version = ${crawl.extractor_version}
        and l.formula_version = ${policy.site_health.link_metrics.formula_version}
      where u.workspace_id = ${crawl.workspace_id} and u.project_id = ${crawl.project_id}
        and exists (
          select 1 from site_url_observations o
          where o.workspace_id = u.workspace_id and o.site_url_id = u.id
            and o.crawl_id = any(${lineage}::uuid[]))
        ${filters.siteUrlId ? sql`and u.id = ${filters.siteUrlId}` : sql``}
        ${pattern ? sql`and (lower(u.normalized_url) like ${pattern} or lower(u.display_url) like ${pattern})` : sql``}
        ${filters.pageKind ? sql`and a.page_kind = ${filters.pageKind}` : sql``}
        ${filters.monitored === true ? sql`and m.site_url_id is not null` : sql``}
        ${filters.monitored === false ? sql`and m.site_url_id is null` : sql``}
    )
    select * from projected
    where true ${statusFilter(filters.status)} ${keyset}
    order by sort_value ${direction}, site_url_id ${direction}
    limit ${limit + 1}`.execute(db);
  return result.rows;
}

/** A page window's items and the cursor after its last row. */
export function pageWindow(
  rows: PageRow[],
  limit: number,
  scope: string,
  fingerprint: Record<string, unknown>,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const next =
    rows.length > limit && last
      ? encodeKeysetCursor(scope, fingerprint, [String(last.sort_value), last.site_url_id])
      : null;
  return { items, next };
}

/** The `(sort value, id)` a page cursor resumes after; `InvalidCursorError` otherwise. */
export function pageCursor(
  cursor: string | null,
  scope: string,
  fingerprint: Record<string, unknown>,
  sort: PageSort,
) {
  if (!cursor) return null;
  const [value, raw, ...rest] = decodeKeysetCursor(cursor, scope, fingerprint);
  const id = parseUuid(raw);
  if (value === undefined || id === null || rest.length > 0)
    throw new InvalidCursorError('invalid cursor');
  if (SORTS[sort].kind === 'int' && !/^-?\d{1,10}$/u.test(value))
    throw new InvalidCursorError('invalid cursor');
  return { value, id };
}
