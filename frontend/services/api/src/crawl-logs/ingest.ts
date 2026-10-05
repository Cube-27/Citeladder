import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { Insertable, Selectable } from 'kysely';
import { sql } from 'kysely';
import { logLines, UnsupportedLogFormat } from '@citeladder/contracts/crawl-log-format';
import type { Database } from '../db/database.ts';
import type { BotRequests, CrawlLogSources } from '../generated/db-schema.ts';
import { ApiError, notFound } from '../errors.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { crawlers } from '../config/crawlers.ts';
import { strings } from '../db/json.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { prepareBatch } from './prepare.ts';
import { lockCrawlState, enqueueRollup, reportingDay, type CrawlScope } from './state.ts';
import { ingestionEnabled } from './sources.ts';
import { lockAuthorizedWorkspace } from '../workspaces/service.ts';

export async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > crawlLogs.max_batch_bytes) throw new ApiError(413, 'Log batch too large');
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function decodedBody(body: Buffer, encoding: string | undefined) {
  if (body.length > crawlLogs.max_batch_bytes) throw new ApiError(413, 'Log batch too large');
  if (encoding && !['gzip', 'identity'].includes(encoding))
    throw new ApiError(415, 'Unsupported log encoding');
  try {
    const decoded =
      encoding === 'gzip' ? gunzipSync(body, { maxOutputLength: crawlLogs.max_batch_bytes }) : body;
    return new TextDecoder('utf-8', { fatal: true }).decode(decoded);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE')
      throw new ApiError(413, 'Decompressed log batch too large');
    throw new ApiError(422, 'Invalid compressed or UTF-8 log batch');
  }
}
export async function batchQuota(
  db: Database,
  source: Selectable<CrawlLogSources>,
  now = new Date(),
  key?: string | null,
) {
  // A retried, already-accepted key returns its stored receipt without spending quota.
  if (
    key &&
    (await db
      .selectFrom('crawl_log_batches')
      .select('id')
      .where('workspace_id', '=', source.workspace_id)
      .where('source_id', '=', source.id)
      .where('idempotency_key', '=', key)
      .executeTakeFirst())
  )
    return;
  await enforceSubjectRequest(
    db,
    'crawl_source',
    source.id,
    {
      operation: 'crawl_logs.batch',
      limit: crawlLogs.batches_per_source_per_hour,
      windowSeconds: 3600,
    },
    now,
  );
}
/** One admission owner for webhooks and uploads. No provider or model I/O. */
export async function ingest(
  db: Database,
  source: Selectable<CrawlLogSources>,
  body: Buffer,
  options: {
    key?: string;
    encoding?: string;
    now?: Date;
    uploadId?: string;
    seq?: number;
    tokenHash?: string;
    actorId?: string;
    quotaChecked?: boolean;
  },
) {
  await ingestionEnabled(db, source.workspace_id);
  const now = options.now ?? new Date();
  const key = options.key ?? createHash('sha256').update(body).digest('hex');
  if (!key.trim() || key.length > 255) throw new ApiError(422, 'Invalid idempotency key');
  // Attempt quota commits before parsing; replay does not spend accepted-line quota.
  if (!options.quotaChecked) await batchQuota(db, source, now, options.key);
  const {
    lines,
    validation,
    format,
    unsupported: formatError,
  } = decodeBatch(source, body, options.encoding, Boolean(options.uploadId));
  let unsupported = formatError;
  // Only batches with lines to verify need the IP range snapshots.
  const snapshots =
    lines.length && !validation && !unsupported
      ? await db
          .selectFrom('bot_ip_range_snapshots')
          .selectAll()
          .where('status', '=', 'succeeded')
          .distinctOn('bot_id')
          .orderBy('bot_id')
          .orderBy('fetched_at', 'desc')
          .orderBy('id', 'desc')
          .execute()
      : [];
  const latest = new Map(snapshots.map((s) => [s.bot_id, s] as const));
  if (!options.uploadId && !validation && !unsupported && lines.length === 0 && !options.key)
    throw new ApiError(422, 'Heartbeat batches require an explicit unique idempotency key');
  const scope = { workspaceId: source.workspace_id, projectId: source.project_id };
  const preset = crawlLogs.presets[options.uploadId ? 'custom_ndjson' : source.preset];
  if (!preset) throw new ApiError(415, 'Unsupported preset');
  const preparedBatch = prepareBatch({ source, lines, preset, latest, now, format });
  const { counts, prepared, first, last } = preparedBatch;
  unsupported ??= preparedBatch.unsupported;
  let receiptStatus = 'accepted';
  if (validation) receiptStatus = 'destination_validation';
  if (unsupported) receiptStatus = 'unsupported_format';
  const receipt = await db.transaction().execute(async (trx) => {
    if (options.actorId)
      await lockAuthorizedWorkspace(trx, scope.workspaceId, options.actorId, 'manage_credentials');
    else if (!crawlLogs.ingestion_enabled)
      // Ownership transfers take the workspace root lock before changing membership.
      await trx
        .selectFrom('workspaces')
        .select('id')
        .where('id', '=', scope.workspaceId)
        .forShare()
        .executeTakeFirst();
    await ingestionEnabled(trx, scope.workspaceId);
    const state = await lockCrawlState(trx, scope);
    const current = await trx
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', source.id)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw notFound('Crawl log source');
    if (current.status !== 'active') throw new ApiError(409, 'Crawl log source revoked');
    if (options.tokenHash && current.token_hash !== options.tokenHash)
      throw new ApiError(401, 'Invalid crawl log token');
    const original = await trx
      .selectFrom('crawl_log_batches')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('source_id', '=', source.id)
      .where('idempotency_key', '=', key)
      .executeTakeFirst();
    if (original) return original;
    await assertUpload(trx, scope, source.id, options.uploadId, options.seq);
    const admitted = await admitRequests(
      trx,
      scope,
      current,
      prepared,
      state.reporting_timezone,
      counts,
    );
    const id = randomUUID();
    await trx
      .insertInto('crawl_log_batches')
      .values({
        id,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        source_id: source.id,
        upload_id: options.uploadId ?? null,
        seq: options.seq ?? null,
        idempotency_key: key,
        received_at: now,
        format,
        status: receiptStatus,
        missing_fields: JSON.stringify(unsupported?.missing_fields ?? []),
        parser_version: crawlLogs.parser_version,
        catalog_version: crawlers.catalog_version,
        ...counts,
        first_line_at: first,
        last_line_at: last,
        heartbeat: !options.uploadId && !unsupported && !validation && lines.length === 0,
      })
      .execute();
    await insertRequests(trx, scope, id, admitted, counts, now);
    const receipt = await trx
      .updateTable('crawl_log_batches')
      .set(counts)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    if (options.uploadId)
      await trx
        .updateTable('crawl_log_uploads')
        .set({
          last_ack_seq: options.seq!,
          updated_at: now,
          ...(unsupported
            ? {
                status: 'unsupported_format',
                missing_fields: JSON.stringify(unsupported.missing_fields),
              }
            : {}),
        })
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', '=', options.uploadId)
        .execute();
    await enqueueRollup(trx, scope, now, { first, last });
    return receipt;
  });
  if (receipt.status === 'unsupported_format')
    throw new ApiError(
      422,
      'This log format does not contain the fields needed for crawler identification.',
      {
        details: { status: receipt.status, missing_fields: strings(receipt.missing_fields) },
      },
    );
  return receipt;
}
async function admitRequests(
  trx: Database,
  scope: CrawlScope,
  source: Selectable<CrawlLogSources>,
  prepared: Insertable<BotRequests>[],
  tz: string,
  counts: ReturnType<typeof prepareBatch>['counts'],
) {
  const days = [...new Set(prepared.map((row) => reportingDay(row.occurred_at as Date, tz)))];
  if (!days.length) return [];
  const excluded = await sql<{ day: string }>`with days as (select unnest(${days}::date[]) as day)
    select to_char(day,'YYYY-MM-DD') as day from days where exists (
      select 1 from crawl_log_batches b join crawl_log_sources s on s.id=b.source_id
      where b.workspace_id=${scope.workspaceId}::uuid and b.project_id=${scope.projectId}::uuid
      and s.host=${source.host} and b.source_id<>${source.id}::uuid and b.status='accepted'
      and (b.lines_matched>0 or b.lines_duplicate>0 or b.lines_unmatched>0 or b.heartbeat)
      and ((day between (b.first_line_at at time zone ${tz})::date and (b.last_line_at at time zone ${tz})::date)
        or (b.heartbeat and (b.received_at at time zone ${tz})::date=day))
    ) or exists (
      select 1 from crawl_log_uploads u join crawl_log_sources s on s.id=u.source_id
      where u.workspace_id=${scope.workspaceId}::uuid and u.project_id=${scope.projectId}::uuid
      and s.host=${source.host} and u.source_id<>${source.id}::uuid and u.status='completed'
      and exists(select 1 from jsonb_array_elements(u.scanned_dates) d where d->>'date'=to_char(day,'YYYY-MM-DD'))
    )`.execute(trx);
  const overlapping = new Set(excluded.rows.map((row) => row.day));
  const admitted = prepared.filter(
    (row) => !overlapping.has(reportingDay(row.occurred_at as Date, tz)),
  );
  counts.lines_overlapping += prepared.length - admitted.length;
  return admitted;
}
async function insertRequests(
  trx: Database,
  scope: CrawlScope,
  id: string,
  admitted: Insertable<BotRequests>[],
  counts: ReturnType<typeof prepareBatch>['counts'],
  now: Date,
) {
  if (admitted.length) {
    for (let start = 0; start < admitted.length; start += crawlLogs.insert_rows_per_statement) {
      const inserted = await trx
        .insertInto('bot_requests')
        .values(
          admitted
            .slice(start, start + crawlLogs.insert_rows_per_statement)
            .map((row) => ({ ...row, batch_id: id })),
        )
        .onConflict((c) => c.doNothing())
        .returning('id')
        .execute();
      counts.lines_matched += inserted.length;
    }
    counts.lines_duplicate = admitted.length - counts.lines_matched;
    if (counts.lines_matched)
      await enforceSubjectRequest(
        trx,
        'crawl_project',
        scope.projectId,
        {
          operation: 'crawl_logs.accepted_lines',
          limit: crawlLogs.accepted_lines_per_project_per_day,
          windowSeconds: 86400,
          amount: counts.lines_matched,
        },
        now,
      );
  }
}
function decodeBatch(
  source: Selectable<CrawlLogSources>,
  body: Buffer,
  explicitEncoding: string | undefined,
  upload: boolean,
) {
  const encoding =
    explicitEncoding ??
    (source.setup === 'cloudflare_logpush' && body[0] === 0x1f && body[1] === 0x8b
      ? 'gzip'
      : undefined);
  const text = decodedBody(body, encoding);
  const format = upload ? 'ndjson' : source.format;
  let lines: string[] = [];
  let unsupported: UnsupportedLogFormat | null = null;
  // Cloudflare validates HTTP destinations with this authenticated gzipped probe.
  const validation =
    source.setup === 'cloudflare_logpush' &&
    /^\s*\{\s*"content"\s*:\s*"tests"\s*\}\s*$/u.test(text);
  try {
    lines = validation ? [] : logLines(text, format, crawlLogs.max_lines_per_batch);
  } catch (error) {
    if (error instanceof RangeError) throw new ApiError(413, 'Too many log lines');
    if (error instanceof UnsupportedLogFormat) unsupported = error;
    else throw error;
  }

  return { lines, validation, unsupported, format };
}
async function assertUpload(
  trx: Database,
  scope: CrawlScope,
  sourceId: string,
  uploadId: string | undefined,
  seq: number | undefined,
) {
  if (uploadId) {
    const upload = await trx
      .selectFrom('crawl_log_uploads')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .where('source_id', '=', sourceId)
      .where('id', '=', uploadId)
      .forUpdate()
      .executeTakeFirst();
    if (!upload) throw notFound('Upload');
    if (upload.status !== 'open' || seq !== upload.last_ack_seq + 1)
      throw new ApiError(409, 'Upload is closed or batch sequence is out of order');
  }
}
