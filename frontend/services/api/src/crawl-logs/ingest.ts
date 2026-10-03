import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { Insertable, Selectable } from 'kysely';
import { sql } from 'kysely';
import {
  logLines,
  parseLogLine,
  UnsupportedLogFormat,
} from '@citeladder/contracts/crawl-log-format';
import type { Database } from '../db/database.ts';
import type { BotRequests, CrawlLogSources } from '../generated/db-schema.ts';
import { ApiError, notFound } from '../errors.ts';
import { crawlLogs } from '../config/crawl-logs.ts';
import { crawlers, matchesCrawlerUserAgent } from '../config/crawlers.ts';
import { hash } from '../traffic/normalization.ts';
import { strings } from '../db/json.ts';
import { enforceSubjectRequest } from '../abuse/usage.ts';
import { pathIdentity, verifyBot } from './identity.ts';
import { lockCrawlState, enqueueRollup } from './state.ts';
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
) {
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
  ingestionEnabled();
  const now = options.now ?? new Date();
  const key = options.key ?? createHash('sha256').update(body).digest('hex');
  if (!key.trim() || key.length > 255) throw new ApiError(422, 'Invalid idempotency key');
  // Attempt quota commits before parsing; replay does not spend accepted-line quota.
  if (!options.quotaChecked) await batchQuota(db, source, now);
  const encoding =
    options.encoding ??
    (source.setup === 'cloudflare_logpush' && body[0] === 0x1f && body[1] === 0x8b
      ? 'gzip'
      : undefined);
  const text = decodedBody(body, encoding);
  let lines: string[] = [];
  let unsupported: UnsupportedLogFormat | null = null;
  // Cloudflare validates HTTP destinations with this authenticated gzipped probe.
  const validation =
    source.setup === 'cloudflare_logpush' &&
    /^\s*\{\s*"content"\s*:\s*"tests"\s*\}\s*$/u.test(text);
  try {
    lines = validation
      ? []
      : logLines(text, options.uploadId ? 'ndjson' : source.format, crawlLogs.max_lines_per_batch);
  } catch (error) {
    if (error instanceof RangeError) throw new ApiError(413, 'Too many log lines');
    if (error instanceof UnsupportedLogFormat) unsupported = error;
    else throw error;
  }
  const counts = {
    lines_received: lines.length,
    lines_parsed: 0,
    lines_matched: 0,
    lines_unmatched: 0,
    lines_out_of_scope: 0,
    lines_rejected: 0,
    lines_duplicate: 0,
    lines_overlapping: 0,
  };
  const prepared: Insertable<BotRequests>[] = [];
  const snapshots = await db
    .selectFrom('bot_ip_range_snapshots')
    .selectAll()
    .distinctOn('bot_id')
    .orderBy('bot_id')
    .orderBy('fetched_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
  const latest = new Map(snapshots.map((s) => [s.bot_id, s] as const));
  const scope = { workspaceId: source.workspace_id, projectId: source.project_id };
  let first: Date | null = null,
    last: Date | null = null;
  const preset = crawlLogs.presets[options.uploadId ? 'custom_ndjson' : source.preset];
  if (!preset) throw new ApiError(415, 'Unsupported preset');
  for (const line of lines) {
    if (Buffer.byteLength(line) > crawlLogs.max_line_bytes) {
      counts.lines_rejected++;
      continue;
    }
    let mapped;
    try {
      mapped = parseLogLine(line, options.uploadId ? 'ndjson' : source.format, preset);
    } catch (error) {
      if (!(error instanceof UnsupportedLogFormat)) throw error;
      unsupported = error;
      prepared.length = 0;
      counts.lines_rejected = lines.length;
      first = last = null;
      break;
    }
    if (!mapped) {
      counts.lines_rejected++;
      continue;
    }
    const at = new Date(mapped.timestamp);
    if (
      at.getTime() > now.getTime() + crawlLogs.max_clock_skew_hours * 3600000 ||
      at.getTime() < now.getTime() - crawlLogs.max_backdate_days * 86400000
    ) {
      counts.lines_rejected++;
      continue;
    }
    counts.lines_parsed++;
    if (first === null || at.getTime() < first.getTime()) first = at;
    if (last === null || at.getTime() > last.getTime()) last = at;
    const bot = crawlers.bots.find((bot) => matchesCrawlerUserAgent(bot, mapped.user_agent));
    if (!bot) {
      counts.lines_unmatched++;
      continue;
    }
    let host = mapped.host?.toLowerCase() ?? source.host;
    {
      try {
        const url = new URL(mapped.path, source.origin);
        if (mapped.host && url.hostname.toLowerCase() !== host) {
          counts.lines_out_of_scope++;
          continue;
        }
        host = url.hostname.toLowerCase();
      } catch {
        counts.lines_rejected++;
        continue;
      }
    }
    if (!strings(source.accepted_hosts).includes(host)) {
      counts.lines_out_of_scope++;
      continue;
    }
    const identity = pathIdentity(mapped.path, source.origin);
    if (!identity || (mapped.request_id?.length ?? 0) > 255) {
      counts.lines_rejected++;
      continue;
    }
    const verification = verifyBot(bot, mapped.client_ip, latest.get(bot.bot_id), at, now);
    prepared.push({
      id: randomUUID(),
      workspace_id: scope.workspaceId,
      project_id: scope.projectId,
      source_id: source.id,
      batch_id: '',
      occurred_at: at,
      host,
      ...identity,
      method: mapped.method,
      status_code: mapped.status,
      bot_id: bot.bot_id,
      catalog_version: crawlers.catalog_version,
      ...verification,
      provider_request_id: mapped.request_id || null,
      line_hash: hash(JSON.stringify([source.id, mapped])),
    });
  }
  const receipt = await db.transaction().execute(async (trx) => {
    if (options.actorId)
      await lockAuthorizedWorkspace(trx, scope.workspaceId, options.actorId, 'manage_credentials');
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
    if (options.uploadId) {
      const upload = await trx
        .selectFrom('crawl_log_uploads')
        .selectAll()
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('source_id', '=', source.id)
        .where('id', '=', options.uploadId)
        .forUpdate()
        .executeTakeFirst();
      if (!upload) throw notFound('Upload');
      if (upload.status !== 'open' || options.seq !== upload.last_ack_seq + 1)
        throw new ApiError(409, 'Upload is closed or batch sequence is out of order');
    }
    const admitted: Insertable<BotRequests>[] = [];
    for (const row of prepared) {
      const date = await sql<{
        day: string;
      }>`select to_char(${row.occurred_at}::timestamptz at time zone ${state.reporting_timezone}, 'YYYY-MM-DD') as day`.execute(
        trx,
      );
      const day = date.rows[0]!.day;
      const overlap = await trx
        .selectFrom('crawl_log_batches as b')
        .innerJoin('crawl_log_sources as s', 's.id', 'b.source_id')
        .select('b.id')
        .where('b.workspace_id', '=', scope.workspaceId)
        .where('b.project_id', '=', scope.projectId)
        .where('s.host', '=', row.host)
        .where('b.source_id', '!=', source.id)
        .where('b.status', '=', 'accepted')
        .where(
          sql<boolean>`(b.lines_matched>0 or b.lines_duplicate>0 or b.lines_unmatched>0 or b.heartbeat)`,
        )
        .where(sql<boolean>`((${day}::date between (b.first_line_at at time zone ${state.reporting_timezone})::date and (b.last_line_at at time zone ${state.reporting_timezone})::date)
          or (b.heartbeat and (b.received_at at time zone ${state.reporting_timezone})::date = ${day}::date))`)
        .executeTakeFirst();
      const declared = await trx
        .selectFrom('crawl_log_uploads as u')
        .innerJoin('crawl_log_sources as s', 's.id', 'u.source_id')
        .select('u.id')
        .where('u.workspace_id', '=', scope.workspaceId)
        .where('u.project_id', '=', scope.projectId)
        .where('s.host', '=', row.host)
        .where('u.source_id', '!=', source.id)
        .where('u.status', '=', 'completed')
        .where(
          sql<boolean>`exists(select 1 from jsonb_array_elements(u.scanned_dates) d where d->>'date'=${day})`,
        )
        .executeTakeFirst();
      if (overlap || declared) {
        counts.lines_overlapping++;
        continue;
      }
      admitted.push(row);
    }
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
        format: options.uploadId ? 'ndjson' : source.format,
        status: unsupported
          ? 'unsupported_format'
          : validation
            ? 'destination_validation'
            : 'accepted',
        missing_fields: JSON.stringify(unsupported?.missing_fields ?? []),
        parser_version: crawlLogs.parser_version,
        catalog_version: crawlers.catalog_version,
        ...counts,
        first_line_at: first,
        last_line_at: last,
        heartbeat: !options.uploadId && !unsupported && !validation && lines.length === 0,
      })
      .execute();
    if (admitted.length) {
      const inserted = await trx
        .insertInto('bot_requests')
        .values(admitted.map((row) => ({ ...row, batch_id: id })))
        .onConflict((c) => c.doNothing())
        .returning('id')
        .execute();
      counts.lines_matched = inserted.length;
      counts.lines_duplicate = admitted.length - inserted.length;
      if (inserted.length)
        await enforceSubjectRequest(
          trx,
          'crawl_project',
          scope.projectId,
          {
            operation: 'crawl_logs.accepted_lines',
            limit: crawlLogs.accepted_lines_per_project_per_day,
            windowSeconds: 86400,
            amount: inserted.length,
          },
          now,
        );
    }
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
    await enqueueRollup(trx, scope, now);
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
