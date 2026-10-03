import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { ApiError, notFound } from '../errors.ts';
import { lockCrawlState, enqueueRollup, type CrawlScope } from './state.ts';
import { ingestionEnabled } from './sources.ts';
import { lockAuthorizedWorkspace } from '../workspaces/service.ts';

export const uploadCreateSchema = z.strictObject({
  filename: z.string().trim().min(1).max(255),
  size_bytes: z.int().nonnegative(),
});
export const uploadBatchSchema = z.strictObject({
  seq: z.int().nonnegative(),
  lines: z.array(z.string().max(crawlLogs.max_line_bytes)).max(crawlLogs.max_lines_per_batch),
});
export const uploadCompleteSchema = z.strictObject({
  scanned_lines: z.int().nonnegative(),
  first_line_at: z.iso.datetime({ offset: true }).nullable(),
  last_line_at: z.iso.datetime({ offset: true }).nullable(),
  scanned_dates: z
    .array(z.strictObject({ date: z.iso.date(), complete: z.boolean() }))
    .max(crawlLogs.max_backdate_days + 1),
});
export async function sourceForUpload(db: Database, scope: CrawlScope, id: string) {
  const source = await db
    .selectFrom('crawl_log_sources')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!source) throw notFound('Crawl log source');
  if (source.status !== 'active' || source.kind !== 'upload')
    throw new ApiError(409, 'Source does not accept uploads');
  return source;
}
export async function createUpload(
  db: Database,
  scope: CrawlScope,
  sourceId: string,
  input: z.output<typeof uploadCreateSchema>,
  actorId: string,
) {
  ingestionEnabled();
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, scope.workspaceId, actorId, 'manage_credentials');
    await lockCrawlState(trx, scope);
    await sourceForUpload(trx, scope, sourceId);
    const now = new Date();
    return trx
      .insertInto('crawl_log_uploads')
      .values({
        id: randomUUID(),
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        source_id: sourceId,
        filename: input.filename.replaceAll(/[/\\]/gu, '_'),
        size_bytes: input.size_bytes,
        status: 'open',
        missing_fields: '[]',
        last_ack_seq: -1,
        scanned_lines: 0,
        first_line_at: null,
        last_line_at: null,
        scanned_dates: '[]',
        created_at: now,
        updated_at: now,
        completed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  });
}
export async function completeUpload(
  db: Database,
  scope: CrawlScope,
  sourceId: string,
  id: string,
  input: z.output<typeof uploadCompleteSchema>,
  actorId: string,
  now = new Date(),
) {
  ingestionEnabled();
  const first = input.first_line_at ? new Date(input.first_line_at) : null,
    last = input.last_line_at ? new Date(input.last_line_at) : null;
  if ((first === null) !== (last === null) || (first && last && first > last))
    throw new ApiError(422, 'Invalid scan span');
  if (input.scanned_lines > 0 && (!first || !last))
    throw new ApiError(422, 'Scan timestamps are required');
  if (
    (first && first.getTime() < now.getTime() - crawlLogs.max_backdate_days * 86400000) ||
    (last && last.getTime() > now.getTime() + crawlLogs.max_clock_skew_hours * 3600000)
  )
    throw new ApiError(422, 'Scan span outside admission window');
  if (new Set(input.scanned_dates.map((d) => d.date)).size !== input.scanned_dates.length)
    throw new ApiError(422, 'Duplicate scanned day');
  return db.transaction().execute(async (trx) => {
    await lockAuthorizedWorkspace(trx, scope.workspaceId, actorId, 'manage_credentials');
    const state = await lockCrawlState(trx, scope);
    const source = await sourceForUpload(trx, scope, sourceId);
    const upload = await trx
      .selectFrom('crawl_log_uploads')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('source_id', '=', sourceId)
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!upload) throw notFound('Upload');
    if (upload.status === 'completed') return upload;
    if (upload.status !== 'open') throw new ApiError(409, 'Upload is closed');
    for (const day of input.scanned_dates) {
      if (!first || !last) throw new ApiError(422, 'Scanned days require timestamps');
      const bounds = await sql<{
        first: string;
        last: string;
      }>`select to_char(${first}::timestamptz at time zone ${state.reporting_timezone}, 'YYYY-MM-DD') as first,
        to_char(${last}::timestamptz at time zone ${state.reporting_timezone}, 'YYYY-MM-DD') as last`.execute(
        trx,
      );
      if (day.date < bounds.rows[0]!.first || day.date > bounds.rows[0]!.last)
        throw new ApiError(422, 'Scanned day outside scan span');
      const overlap = await trx
        .selectFrom('crawl_log_batches as b')
        .innerJoin('crawl_log_sources as s', 's.id', 'b.source_id')
        .select('b.id')
        .where('b.workspace_id', '=', scope.workspaceId)
        .where('b.project_id', '=', scope.projectId)
        .where('s.host', '=', source.host)
        .where('b.source_id', '!=', sourceId)
        .where(sql<boolean>`${day.date}::date between (coalesce(b.first_line_at,b.received_at) at time zone ${state.reporting_timezone})::date
          and (coalesce(b.last_line_at,b.received_at) at time zone ${state.reporting_timezone})::date`)
        .executeTakeFirst();
      if (overlap) throw new ApiError(409, 'Scanned day overlaps another source');
    }
    const completed = await trx
      .updateTable('crawl_log_uploads')
      .set({
        status: 'completed',
        scanned_lines: input.scanned_lines,
        first_line_at: first,
        last_line_at: last,
        scanned_dates: JSON.stringify(input.scanned_dates),
        updated_at: now,
        completed_at: now,
      })
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await enqueueRollup(trx, scope, now);
    return completed;
  });
}
