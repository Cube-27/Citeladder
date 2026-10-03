import { sql } from 'kysely';
import { z } from 'zod';
import {
  botActivityResponseSchema,
  botCrawlersResponseSchema,
  crawlCoverageResponseSchema,
  crawlSummarySchema,
  verificationSchema,
} from '@citeladder/contracts/ai-traffic';
import type { Database } from '../db/database.ts';
import { crawlers } from '../config/crawlers.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { policy } from '../config.ts';
import { ApiError } from '../errors.ts';
import {
  encodeKeysetCursor,
  decodeKeysetCursor,
  InvalidCursorError,
} from '../http/keyset-cursor.ts';
import { isoDateText, utcTextOf, pydanticUtc } from '../db/timestamps.ts';
import { sourceList } from './source-reads.ts';
import type { CrawlScope } from './state.ts';

export type CrawlReadOptions = {
  range?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  purpose?: string | null;
  verification?: string | null;
  cursor?: string | null;
  limit?: number | null;
  bot_id?: string | null;
  status?: number | null;
  folder?: string | null;
  resource_class?: string | null;
};
function verificationFilter(value?: string | null) {
  if (!value) return crawlLogs.default_verification_filter;
  const items = value.split(',').sort();
  if (!items.length || items.some((v) => !verificationSchema.safeParse(v).success))
    throw new ApiError(422, 'Invalid verification filter');
  return [...new Set(items)];
}
function window(options: CrawlReadOptions) {
  if (Boolean(options.start_date) !== Boolean(options.end_date))
    throw new ApiError(422, 'Both dates are required');
  if (options.start_date && options.end_date) {
    if (
      !z.iso.date().safeParse(options.start_date).success ||
      !z.iso.date().safeParse(options.end_date).success ||
      options.start_date > options.end_date ||
      (Date.parse(options.end_date) - Date.parse(options.start_date)) / 86400000 >
        policy.analytics.max_window_days
    )
      throw new ApiError(422, 'Invalid crawl window');
    return { start: options.start_date, end: options.end_date };
  }
  const ranges: Record<string, number> = policy.analytics.preset_range_days;
  const days = options.range ? ranges[options.range] : ranges['30d'];
  if (!days) throw new ApiError(422, 'Invalid crawl range');
  const end = new Date().toISOString().slice(0, 10);
  return {
    start: new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0, 10),
    end,
  };
}
function rollups(db: Database, scope: CrawlScope, options: CrawlReadOptions) {
  const w = window(options);
  let q = db
    .selectFrom('bot_activity_daily')
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('reporting_date', '>=', sql<Date>`${w.start}::date`)
    .where('reporting_date', '<=', sql<Date>`${w.end}::date`)
    .where('verification', 'in', verificationFilter(options.verification));
  if (options.purpose) {
    const bots = crawlers.bots.filter((b) => b.purpose === options.purpose).map((b) => b.bot_id);
    if (!bots.length) throw new ApiError(422, 'Invalid purpose');
    q = q.where('bot_id', 'in', bots);
  }
  if (options.bot_id) q = q.where('bot_id', '=', options.bot_id);
  if (options.folder) q = q.where('folder', '=', options.folder);
  if (options.resource_class) q = q.where('resource_class', '=', options.resource_class);
  if (options.status) q = q.where('status_code', '=', options.status);
  return q;
}
function cursorParts(scope: CrawlScope, view: string, options: CrawlReadOptions) {
  const endpoint = [scope.workspaceId, scope.projectId, view].join(':');
  const { cursor, ...filters } = options;
  try {
    return { endpoint, filters, keys: cursor ? decodeKeysetCursor(cursor, endpoint, filters) : [] };
  } catch (error) {
    if (error instanceof InvalidCursorError) throw new ApiError(422, error.message);
    throw error;
  }
}
function pageLimit(options: CrawlReadOptions) {
  const limit = options.limit ?? crawlLogs.default_page_size;
  if (!Number.isInteger(limit) || limit < 1 || limit > crawlLogs.max_page_size)
    throw new ApiError(422, 'Invalid page size');
  return limit;
}
export async function crawlerPage(db: Database, scope: CrawlScope, options: CrawlReadOptions = {}) {
  const binding = cursorParts(scope, 'crawlers', options),
    limit = pageLimit(options);
  if (binding.keys.length && binding.keys.length !== 1)
    throw new ApiError(422, 'Invalid crawler cursor');
  let query = rollups(db, scope, options);
  if (binding.keys[0]) query = query.where('bot_id', '>', binding.keys[0]);
  const rows = await query
    .select([
      'bot_id',
      sql<number>`sum(requests)::integer`.as('requests'),
      sql<number>`count(distinct url_hash)::integer`.as('pages'),
      sql<Date>`max(last_seen_at)`.as('last_seen'),
    ])
    .groupBy('bot_id')
    .orderBy('bot_id')
    .limit(limit + 1)
    .execute();
  const selected = rows.slice(0, limit);
  const items = await Promise.all(
    selected.map(async (row) => {
      const base = rollups(db, scope, { ...options, bot_id: row.bot_id });
      const statuses = await base
        .select(['status_code', sql<number>`sum(requests)::integer`.as('count')])
        .groupBy('status_code')
        .execute();
      const verifications = await base
        .select(['verification', sql<number>`sum(requests)::integer`.as('count')])
        .groupBy('verification')
        .execute();
      const folders = await base
        .select(['folder', sql<number>`sum(requests)::integer`.as('count')])
        .groupBy('folder')
        .orderBy('count', 'desc')
        .limit(crawlLogs.max_page_size)
        .execute();
      const resources = await base
        .select(['resource_class', sql<number>`sum(requests)::integer`.as('count')])
        .groupBy('resource_class')
        .execute();
      const w = window(options);
      let reasonQuery = db
        .selectFrom('bot_requests')
        .select(['verification_reason', sql<number>`count(*)::integer`.as('count')])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('bot_id', '=', row.bot_id)
        .where('verification', 'in', verificationFilter(options.verification))
        .where('occurred_at', '>=', new Date(w.start + 'T00:00:00Z'))
        .where('occurred_at', '<', new Date(Date.parse(w.end) + 86400000))
        .groupBy('verification_reason');
      if (options.status) reasonQuery = reasonQuery.where('status_code', '=', options.status);
      if (options.folder) reasonQuery = reasonQuery.where('folder', '=', options.folder);
      if (options.resource_class)
        reasonQuery = reasonQuery.where('resource_class', '=', options.resource_class);
      const reasons = await reasonQuery.execute();
      const bot = crawlers.bots.find((b) => b.bot_id === row.bot_id)!;
      return {
        ...row,
        pages: row.pages || null,
        label: bot.label,
        purpose: bot.purpose,
        last_seen: row.last_seen.toISOString(),
        status_codes: Object.fromEntries(statuses.map((s) => [String(s.status_code), s.count])),
        verification: Object.fromEntries(verifications.map((s) => [s.verification, s.count])),
        verification_reasons: Object.fromEntries(
          reasons.map((s) => [s.verification_reason ?? 'verified', s.count]),
        ),
        folders: Object.fromEntries(folders.map((s) => [s.folder, s.count])),
        resources: Object.fromEntries(resources.map((s) => [s.resource_class, s.count])),
      };
    }),
  );
  const last = selected.at(-1);
  return botCrawlersResponseSchema.parse({
    items,
    next_cursor:
      rows.length > limit && last
        ? encodeKeysetCursor(binding.endpoint, binding.filters, [last.bot_id])
        : null,
  });
}
export async function activityPage(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions = {},
) {
  const binding = cursorParts(scope, 'activity', options),
    limit = pageLimit(options);
  let query = db
    .selectFrom('bot_requests')
    .select([
      'id',
      'source_id',
      'batch_id',
      'host',
      'display_path',
      'identity',
      'identity_reason',
      'url_hash',
      'folder',
      'resource_class',
      'method',
      'status_code',
      'bot_id',
      'catalog_version',
      'verification',
      'verification_reason',
      'verification_basis',
      'ip_range_snapshot_id',
      utcTextOf(sql.ref('occurred_at')).as('occurred'),
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('occurred_at', '>=', new Date(Date.now() - crawlLogs.retention_days * 86400000))
    .where('verification', 'in', verificationFilter(options.verification));
  if (options.bot_id) query = query.where('bot_id', '=', options.bot_id);
  if (options.status) query = query.where('status_code', '=', options.status);
  if (options.folder) query = query.where('folder', '=', options.folder);
  if (options.resource_class) query = query.where('resource_class', '=', options.resource_class);
  if (options.range || options.start_date || options.end_date) {
    const w = window(options);
    query = query
      .where('occurred_at', '>=', new Date(w.start + 'T00:00:00Z'))
      .where('occurred_at', '<', new Date(Date.parse(w.end) + 86400000));
  }
  if (binding.keys.length) {
    if (
      binding.keys.length !== 2 ||
      !z.iso.datetime({ offset: true }).safeParse(binding.keys[0]).success ||
      !z.uuid().safeParse(binding.keys[1]).success
    )
      throw new ApiError(422, 'Invalid activity cursor');
    query = query.where(
      sql<boolean>`(occurred_at,id)<(${binding.keys[0]}::timestamptz,${binding.keys[1]}::uuid)`,
    );
  }
  const rows = await query
    .orderBy('occurred_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit + 1)
    .execute();
  const items = rows
    .slice(0, limit)
    .map(({ occurred, ...row }) => ({ ...row, occurred_at: pydanticUtc(occurred) }));
  const last = items.at(-1);
  return botActivityResponseSchema.parse({
    items,
    next_cursor:
      rows.length > limit && last
        ? encodeKeysetCursor(binding.endpoint, binding.filters, [last.occurred_at, last.id])
        : null,
  });
}
export async function coveragePage(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions = {},
) {
  const w = window(options),
    limit = pageLimit(options),
    binding = cursorParts(scope, 'coverage', options);
  let q = db
    .selectFrom('crawl_log_coverage_daily')
    .select([
      'source_id',
      'reporting_timezone',
      'coverage',
      'reason',
      'batch_count',
      'heartbeat_count',
      'max_gap_minutes',
      isoDateText(sql.ref('reporting_date')).as('reporting_date'),
    ])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('reporting_date', '>=', sql<Date>`${w.start}::date`)
    .where('reporting_date', '<=', sql<Date>`${w.end}::date`);
  if (binding.keys.length) {
    if (
      binding.keys.length !== 3 ||
      !z.iso.date().safeParse(binding.keys[0]).success ||
      !z.uuid().safeParse(binding.keys[1]).success
    )
      throw new ApiError(422, 'Invalid coverage cursor');
    q = q.where(
      sql<boolean>`(reporting_date,source_id,reporting_timezone)>(${binding.keys[0]}::date,${binding.keys[1]}::uuid,${binding.keys[2]})`,
    );
  }
  const rows = await q
      .orderBy('reporting_date')
      .orderBy('source_id')
      .orderBy('reporting_timezone')
      .limit(limit + 1)
      .execute(),
    items = rows.slice(0, limit),
    last = items.at(-1);
  return crawlCoverageResponseSchema.parse({
    items,
    sources: (await sourceList(db, scope)).items,
    next_cursor:
      rows.length > limit && last
        ? encodeKeysetCursor(binding.endpoint, binding.filters, [
            last.reporting_date,
            last.source_id,
            last.reporting_timezone,
          ])
        : null,
  });
}
export async function crawlSummary(
  db: Database,
  scope: CrawlScope,
  options: CrawlReadOptions = {},
) {
  const sources = (await sourceList(db, scope)).items,
    w = window(options);
  const total = await rollups(db, scope, options)
    .select([
      sql<number>`coalesce(sum(requests),0)::integer`.as('requests'),
      sql<number>`count(distinct url_hash)::integer`.as('pages'),
      sql<number>`count(distinct bot_id)::integer`.as('bots'),
      sql<number>`coalesce(sum(requests) filter(where status_code>=400),0)::integer`.as('errors'),
    ])
    .executeTakeFirstOrThrow();
  const failed = await rollups(db, scope, { ...options, verification: 'failed_verification' })
    .select(sql<number>`coalesce(sum(requests),0)::integer`.as('count'))
    .executeTakeFirstOrThrow();
  const coverage = await db
    .selectFrom('crawl_log_coverage_daily')
    .select(['coverage', 'reporting_timezone', isoDateText(sql.ref('reporting_date')).as('day')])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('reporting_date', '>=', sql<Date>`${w.start}::date`)
    .where('reporting_date', '<=', sql<Date>`${w.end}::date`)
    .execute();
  const days = (Date.parse(w.end) - Date.parse(w.start)) / 86400000 + 1;
  const adequate =
    coverage.length > 0 &&
    new Set(
      coverage
        .filter((c) => c.coverage === 'complete' || c.coverage === 'declared_complete')
        .map((c) => c.day),
    ).size === days &&
    coverage.every((c) => c.coverage === 'complete' || c.coverage === 'declared_complete');
  const quality = adequate
    ? coverage.every((c) => c.coverage === 'complete')
      ? 'complete'
      : 'declared_complete'
    : coverage.some((c) => c.coverage !== 'unknown')
      ? 'partial'
      : 'unknown';
  const series = await rollups(db, scope, options)
    .select([
      isoDateText(sql.ref('reporting_date')).as('date'),
      'bot_id',
      sql<number>`sum(requests)::integer`.as('requests'),
    ])
    .groupBy(['reporting_date', 'bot_id'])
    .orderBy('reporting_date')
    .execute();
  const purposes = new Map<string, { date: string; purpose: string; requests: number }>();
  for (const row of series) {
    const purpose = crawlers.bots.find((b) => b.bot_id === row.bot_id)!.purpose,
      key = row.date + ':' + purpose;
    const old = purposes.get(key);
    if (old) old.requests += row.requests;
    else purposes.set(key, { date: row.date, purpose, requests: row.requests });
  }
  const connection = !sources.some((s) => s.status === 'active')
    ? 'not_connected'
    : sources.some((s) => s.connection === 'connected')
      ? 'connected'
      : 'awaiting_data';
  const measured = total.requests > 0 || adequate;
  return crawlSummarySchema.parse({
    unit: 'requests',
    identity_level: 'path',
    connection,
    coverage: quality,
    reporting_timezone: [...new Set(coverage.map((c) => c.reporting_timezone))].join(', ') || 'UTC',
    last_processed_at:
      sources
        .map((s) => s.last_processed_at)
        .filter((s): s is string => !!s)
        .sort()
        .at(-1) ?? null,
    requests: measured ? total.requests : null,
    pages: total.pages > 0 || adequate ? total.pages : null,
    active_bots: measured ? total.bots : null,
    error_share:
      total.requests && (total.errors > 0 || adequate) ? total.errors / total.requests : null,
    failed_verification_requests: failed.count,
    series: [...purposes.values()],
  });
}
