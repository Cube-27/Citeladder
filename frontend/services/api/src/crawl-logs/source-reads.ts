import type { z } from 'zod';
import { crawlSourceListSchema } from '@citeladder/contracts/ai-traffic';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import type { CrawlScope } from './state.ts';
import { crawlLogs } from '../config/crawl-logs.ts';

function connection(status: string, accepted: Date | null | undefined, completed: number) {
  if (status === 'revoked') return 'not_connected';
  return accepted || completed ? 'connected' : 'awaiting_data';
}
/** Three scoped reads, independent of source count; never refreshes or verifies. */
export async function sourceList(
  db: Database,
  scope: CrawlScope,
): Promise<z.input<typeof crawlSourceListSchema>> {
  const [rows, batches, uploads] = await Promise.all([
    db
      .selectFrom('crawl_log_sources')
      .selectAll()
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .orderBy('created_at', 'desc')
      .execute(),
    db
      .selectFrom('crawl_log_batches')
      .select([
        'source_id',
        sql<Date | null>`max(received_at) filter(where status='accepted')`.as('last'),
        sql<number>`count(*) filter(where status='unsupported_format')::integer`.as('unsupported'),
        sql<number>`coalesce(sum(lines_rejected),0)::integer`.as('rejected'),
        sql<number>`coalesce(sum(lines_overlapping),0)::integer`.as('overlapping'),
      ])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .groupBy('source_id')
      .execute(),
    db
      .selectFrom('crawl_log_uploads')
      .select([
        'source_id',
        sql<number>`count(*) filter(where status='unsupported_format')::integer`.as('count'),
        sql<number>`count(*) filter(where status='completed')::integer`.as('completed'),
      ])
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .groupBy('source_id')
      .execute(),
  ]);
  const batchBySource = new Map(batches.map((row) => [row.source_id, row]));
  const uploadBySource = new Map(uploads.map((row) => [row.source_id, row]));
  const items = rows.map((s) => {
    const batch = batchBySource.get(s.id);
    const upload = uploadBySource.get(s.id);
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
      connection: connection(s.status, batch?.last, upload?.completed ?? 0),
      last_accepted_batch: batch?.last?.toISOString() ?? null,
      last_processed_at: s.last_processed_at?.toISOString() ?? null,
      rejected_lines: batch?.rejected ?? 0,
      overlapping_lines: batch?.overlapping ?? 0,
      unsupported_uploads: upload?.count ?? 0,
      unsupported_batches: batch?.unsupported ?? 0,
    };
  });
  return crawlSourceListSchema.parse({ ingestion_enabled: crawlLogs.ingestion_enabled, items });
}
