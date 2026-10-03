import { createHash, randomUUID } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { crawlLogs } from '../config/crawl-logs.ts';
import { crawlers } from '../config/crawlers.ts';
import { fetchWebsite, type WebsiteFetcher } from '../projects/safe-fetch.ts';
import { hash } from '../traffic/normalization.ts';
import { record } from '../db/json.ts';
import { enqueueTask } from '../referrals/enqueue.ts';
import type { Database } from '../db/database.ts';
import type { Executor } from '../workers/executor.ts';
import { enqueueRollup, lockCrawlState } from './state.ts';

export function botIpRangeRefresh(fetcher: WebsiteFetcher = fetchWebsite): Executor {
  return async (task, { checkCancelled }) => {
    const bot = crawlers.bots.find((b) => b.bot_id === record(task.payload).bot_id);
    if (!bot || bot.verification.method !== 'ip_ranges') throw new Error('Unknown IP range bot');
    await checkCancelled('ip-range-dispatch');
    const source = bot.verification.source_url;
    let cidrs: string[] = [],
      status = 'failed',
      contentHash = hash('');
    const fetchedAt = new Date();
    try {
      // Analytics running dispatch was committed by the owning worker before this I/O.
      const response = await fetcher(source, {
        maxBytes: crawlLogs.ip_range_max_bytes,
        maxDecodedBytes: crawlLogs.ip_range_max_bytes,
        timeoutSeconds: crawlLogs.ip_range_timeout_seconds,
        redirects: crawlLogs.ip_range_max_redirects,
        contentTypes: ['application/json'],
      });
      if (response.status < 200 || response.status >= 300) throw new Error('Range response failed');
      contentHash = createHash('sha256').update(response.body).digest('hex');
      const value = record(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)),
      );
      if (!Array.isArray(value.prefixes)) throw new Error('Missing prefixes');
      cidrs = value.prefixes.flatMap((p) => {
        const prefix = record(p);
        return [prefix.ipv4Prefix, prefix.ipv6Prefix].filter(
          (v): v is string => typeof v === 'string',
        );
      });
      if (!cidrs.length) throw new Error('Empty IP range response');
      cidrs.forEach((c) => ipaddr.parseCIDR(c));
      status = 'succeeded';
    } catch {
      cidrs = [];
    }
    return {
      error: null,
      persist: async (trx) => {
        await trx
          .insertInto('bot_ip_range_snapshots')
          .values({
            id: randomUUID(),
            bot_id: bot.bot_id,
            source_url: source,
            fetched_at: fetchedAt,
            content_hash: contentHash,
            cidrs: JSON.stringify(cidrs),
            status,
          })
          .execute();
      },
    };
  };
}
export const botRequestRetentionSweep: Executor = async (task, { db, checkCancelled }) => {
  const cutoff = new Date(Date.now() - crawlLogs.retention_days * 86400000);
  for (;;) {
    await checkCancelled('crawl-log-retention');
    const deleted = await db.transaction().execute(async (trx) => {
      const rows = await trx
        .selectFrom('bot_requests')
        .select('id')
        .where('workspace_id', '=', task.workspace_id)
        .where('occurred_at', '<', cutoff)
        .orderBy('occurred_at')
        .orderBy('id')
        .limit(crawlLogs.sweep_batch_size)
        .execute();
      if (!rows.length) return 0;
      await trx
        .deleteFrom('bot_requests')
        .where('workspace_id', '=', task.workspace_id)
        .where(
          'id',
          'in',
          rows.map((r) => r.id),
        )
        .execute();
      return rows.length;
    });
    if (!deleted) return;
  }
};
export async function abandonUploads(db: Database, workspaceId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - crawlLogs.upload_abandon_hours * 3600000);
  const rows = await db
    .selectFrom('crawl_log_uploads')
    .select(['id', 'project_id'])
    .where('workspace_id', '=', workspaceId)
    .where('status', '=', 'open')
    .where('updated_at', '<', cutoff)
    .limit(crawlLogs.sweep_batch_size)
    .execute();
  for (const row of rows)
    await db.transaction().execute(async (trx) => {
      const scope = { workspaceId, projectId: row.project_id };
      await lockCrawlState(trx, scope);
      const changed = await trx
        .updateTable('crawl_log_uploads')
        .set({ status: 'abandoned', updated_at: now })
        .where('workspace_id', '=', workspaceId)
        .where('project_id', '=', row.project_id)
        .where('id', '=', row.id)
        .where('status', '=', 'open')
        .where('updated_at', '<', cutoff)
        .returning('id')
        .executeTakeFirst();
      if (changed) await enqueueRollup(trx, scope, now);
    });
  return rows.length;
}
export const crawlLogUploadAbandonSweep: Executor = async (task, { db, checkCancelled }) => {
  for (;;) {
    await checkCancelled('upload-abandon');
    if (!(await abandonUploads(db, task.workspace_id))) return;
  }
};
export async function crawlLogTick(
  db: Database,
  now = new Date(),
  canAdmit: () => boolean = () => true,
) {
  if (!crawlLogs.ingestion_enabled) return;
  const system = await db
    .selectFrom('workspaces')
    .select('id')
    .where('is_system', '=', true)
    .executeTakeFirst();
  if (system)
    for (const bot of crawlers.bots.filter((b) => b.verification.method === 'ip_ranges')) {
      if (!canAdmit()) return;
      await enqueueTask(db, {
        workspaceId: system.id,
        projectId: null,
        kind: 'bot_ip_range_refresh',
        payload: { bot_id: bot.bot_id },
        keyParts: [
          bot.bot_id,
          Math.floor(now.getTime() / (crawlLogs.ip_range_refresh_hours * 3600000)),
        ],
        maxAttempts: crawlLogs.task_max_attempts,
      });
    }
  const workspaces = await db
    .selectFrom('crawl_log_sources')
    .select('workspace_id')
    .distinct()
    .execute();
  for (const workspace of workspaces)
    for (const kind of ['bot_request_retention_sweep', 'crawl_log_upload_abandon_sweep']) {
      if (!canAdmit()) return;
      await enqueueTask(db, {
        workspaceId: workspace.workspace_id,
        projectId: null,
        kind,
        payload: {},
        keyParts: [workspace.workspace_id, now.toISOString().slice(0, 10)],
        maxAttempts: crawlLogs.task_max_attempts,
      });
    }
}
