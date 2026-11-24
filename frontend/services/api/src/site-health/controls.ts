import { setTimeout } from 'node:timers/promises';
import type { SiteCrawlListItem } from '@citeladder/contracts/site-health';
import { sql } from 'kysely';
import { inTransaction, type Database } from '../db/database.ts';
import { isRetryableContention } from '../db/errors.ts';
import { policy } from '../config.ts';
import { notFound } from '../errors.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../http/keyset-cursor.ts';
import { parseUuid } from '../http/uuid.ts';
import { settleCrawlFetches } from './fetch-budget.ts';
import { isPageRerun } from './page-rerun.ts';
import { crawlSetting } from './planner-policy.ts';
import { requireProject } from '../projects/access.ts';
import { isTerminal } from './reads/crawl.ts';
import { crawlProjection } from './reads/crawl-projection.ts';
import { recordCrawlEvent } from './site-task.ts';
import { persistTerminalCounters } from './terminal-counters.ts';
import { analyzedPageCount } from './crawl-assessment.ts';

export async function listCrawls(
  db: Database,
  workspaceId: string,
  input: {
    project_id: string | null;
    limit: number;
    cursor: string | null;
  },
) {
  const filters = { workspace_id: workspaceId, project_id: input.project_id };
  let query = db.selectFrom('site_crawls').selectAll().where('workspace_id', '=', workspaceId);
  if (input.project_id) {
    await requireProject(db, { workspaceId, projectId: input.project_id });
    query = query.where('project_id', '=', input.project_id);
  }
  if (input.cursor) {
    const keys = decodeKeysetCursor(input.cursor, 'crawls', filters);
    const date = keys[0] ? new Date(keys[0]) : null;
    const id = parseUuid(keys[1]);
    if (keys.length !== 2 || !date || !Number.isFinite(date.getTime()) || !id)
      throw new InvalidCursorError('invalid cursor');
    query = query.where(sql<boolean>`(created_at, id) < (${date}, ${id}::uuid)`);
  }
  const rows = await query
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(input.limit + 1)
    .execute();
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  const runs = await rerunPages(db, workspaceId, items.filter(isPageRerun));
  return {
    items: await Promise.all(
      items.map(async (crawl) => ({
        ...(await crawlProjection(db, crawl)),
        run: runs.get(crawl.id) ?? SITE_RUN,
      })),
    ),
    next_cursor:
      rows.length > input.limit && last
        ? encodeKeysetCursor('crawls', filters, [last.created_at.toISOString(), last.id])
        : null,
  };
}

type CrawlRun = SiteCrawlListItem['run'];
const SITE_RUN: CrawlRun = { kind: 'site' };

async function rerunPages(db: Database, workspaceId: string, reruns: { id: string }[]) {
  if (!reruns.length) return new Map<string, CrawlRun>();
  const rows = await db
    .selectFrom('site_url_observations')
    .select(['crawl_id', sql<string>`min(site_url_id::text)`.as('site_url_id')])
    .select((eb) => eb.fn.countAll<number>().as('page_count'))
    .where('workspace_id', '=', workspaceId)
    .where('crawl_id', '=', sql<string>`any(${reruns.map((rerun) => rerun.id)}::uuid[])`)
    .groupBy('crawl_id')
    .execute();
  return new Map<string, CrawlRun>(
    rows.map((row) => [
      row.crawl_id,
      Number(row.page_count) === 1
        ? { kind: 'page', site_url_id: row.site_url_id }
        : { kind: 'pages', page_count: Number(row.page_count) },
    ]),
  );
}

function cancelOnce(db: Database, workspaceId: string, crawlId: string) {
  return inTransaction(db, async (trx) => {
    const crawl = await trx
      .selectFrom('site_crawls')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', crawlId)
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!crawl) throw notFound('Crawl');
    if (isTerminal(crawl)) return;
    const now = new Date();
    const analyzed = await analyzedPageCount(trx, crawl);
    await trx
      .updateTable('site_crawls')
      .set({
        status: 'cancelled',
        completed_at: now,
        updated_at: now,
        analyzed_url_count: analyzed,
        ...(['pending', 'running', 'stopped'].includes(crawl.discovery_status)
          ? { discovery_status: 'cancelled' }
          : {}),
        ...(!['completed', 'partially_completed', 'failed', 'cancelled'].includes(
          crawl.analysis_status,
        )
          ? { analysis_status: 'cancelled' }
          : {}),
      })
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', crawlId)
      .execute();
    await trx
      .updateTable('site_crawl_tasks')
      .set({
        status: 'cancelled',
        lease_owner: null,
        lease_expires_at: null,
        completed_at: now,
        updated_at: now,
        error_code: 'cancelled',
      })
      .where('workspace_id', '=', workspaceId)
      .where('id', 'in', (eb) =>
        eb
          .selectFrom('site_crawl_tasks')
          .select('id')
          .where('workspace_id', '=', workspaceId)
          .where('crawl_id', '=', crawlId)
          .where('status', 'not in', ['succeeded', 'failed', 'cancelled'])
          .forNoKeyUpdate()
          .skipLocked(),
      )
      .execute();
    await persistTerminalCounters(trx, { ...crawl, status: 'cancelled' });
    await settleCrawlFetches(trx, crawl);
    await recordCrawlEvent(trx, crawl, 'crawl.cancelled', 'crawl cancelled', {});
  });
}

export function cancelCrawl(db: Database, workspaceId: string, crawlId: string) {
  return cancelWithRetry(db, workspaceId, crawlId, 0);
}

async function cancelWithRetry(
  db: Database,
  workspaceId: string,
  crawlId: string,
  attempt: number,
): Promise<void> {
  try {
    await cancelOnce(db, workspaceId, crawlId);
  } catch (error) {
    if (
      db.isTransaction ||
      attempt >= policy.site_health.crawl.cancel_db_conflict_retries ||
      !isRetryableContention(error)
    )
      throw error;
    const delay =
      Number(crawlSetting('db_conflict_base_delay_seconds')) +
      (((attempt + 1) * 0.37) % 1) * Number(crawlSetting('db_conflict_jitter_seconds'));
    await setTimeout(delay * 1000);
    await cancelWithRetry(db, workspaceId, crawlId, attempt + 1);
  }
}
