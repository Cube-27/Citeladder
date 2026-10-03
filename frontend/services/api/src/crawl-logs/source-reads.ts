import type { z } from 'zod';
import { crawlSourceListSchema } from '@citeladder/contracts/ai-traffic';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import type { CrawlScope } from './state.ts';
import { crawlLogs } from '../config/crawl-logs.ts';

/** Diagnostics are persisted reads; they never refresh or verify anything. */
export async function sourceList(
  db: Database,
  scope: CrawlScope,
): Promise<z.input<typeof crawlSourceListSchema>> {
  const rows = await db
    .selectFrom('crawl_log_sources')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .orderBy('created_at', 'desc')
    .execute();
  const items = await Promise.all(
    rows.map(async (s) => {
      const batches = await db
        .selectFrom('crawl_log_batches')
        .select([
          sql<Date | null>`max(received_at)`.as('last'),
          sql<number>`coalesce(sum(lines_rejected),0)::integer`.as('rejected'),
          sql<number>`coalesce(sum(lines_overlapping),0)::integer`.as('overlapping'),
        ])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('source_id', '=', s.id)
        .executeTakeFirstOrThrow();
      const unsupported = await db
        .selectFrom('crawl_log_uploads')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('source_id', '=', s.id)
        .where('status', '=', 'unsupported_format')
        .executeTakeFirstOrThrow();
      return {
        id: s.id,
        kind: s.kind,
        setup: s.setup,
        preset: s.preset,
        format: s.format,
        collection_point: s.collection_point,
        sampling: s.sampling,
        origin: s.origin,
        host: s.host,
        status: s.status,
        token_prefix: s.token_prefix,
        connection:
          s.status === 'revoked' ? 'not_connected' : batches.last ? 'connected' : 'awaiting_data',
        last_accepted_batch: batches.last?.toISOString() ?? null,
        last_processed_at: s.last_processed_at?.toISOString() ?? null,
        rejected_lines: batches.rejected,
        overlapping_lines: batches.overlapping,
        unsupported_uploads: Number(unsupported.count),
      };
    }),
  );
  return crawlSourceListSchema.parse({ ingestion_enabled: crawlLogs.ingestion_enabled, items });
}
