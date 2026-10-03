import { robotsFactsSchema } from '@citeladder/contracts/site-health';
import { sql } from 'kysely';
import type { Database } from '../../db/database.ts';
import { record } from '../../db/json.ts';
import { utcText, pydanticUtc } from '../../db/timestamps.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../../http/keyset-cursor.ts';
import { parseUuid } from '../../http/uuid.ts';
import { loadProject } from './crawl.ts';

/** Observation order belongs to crawls; content-addressed bodies may recur. */
export async function robotsHistory(
  db: Database,
  workspaceId: string,
  projectId: string,
  input: { limit: number; cursor: string | null },
) {
  await loadProject(db, workspaceId, projectId);
  const filters = { workspace_id: workspaceId, project_id: projectId };
  const observedAt = sql<Date>`(site_facts -> 'robots' ->> 'observed_at')::timestamptz`;
  let query = db
    .selectFrom('site_crawls')
    .select(['id', 'site_facts', 'robots_snapshot_id'])
    .select(utcText(observedAt).$notNull().as('observed_at'))
    .where('workspace_id', '=', workspaceId)
    .where('project_id', '=', projectId)
    .where(sql<boolean>`site_facts -> 'robots' ->> 'observed_at' IS NOT NULL`);
  if (input.cursor) {
    const keys = decodeKeysetCursor(input.cursor, 'robots-history', filters);
    const id = parseUuid(keys[1]);
    if (keys.length !== 2 || !keys[0] || !Number.isFinite(Date.parse(keys[0])) || !id)
      throw new InvalidCursorError('invalid cursor');
    query = query.where(sql<boolean>`(${observedAt}, id) < (${keys[0]}::timestamptz, ${id}::uuid)`);
  }
  const rows = await query
    .orderBy(observedAt, 'desc')
    .orderBy('id', 'desc')
    .limit(input.limit + 1)
    .execute();
  const page = rows.slice(0, input.limit);
  const ids = [
    ...new Set(page.flatMap((row) => (row.robots_snapshot_id ? [row.robots_snapshot_id] : []))),
  ];
  const snapshots = ids.length
    ? await db
        .selectFrom('robots_snapshots')
        .select(['id', 'origin', 'content_hash', 'body', 'truncated', 'status_code'])
        .where('workspace_id', '=', workspaceId)
        .where('project_id', '=', projectId)
        .where('id', 'in', ids)
        .execute()
    : [];
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      crawl_id: row.id,
      observed_at: pydanticUtc(row.observed_at),
      robots: robotsFactsSchema.parse(record(row.site_facts).robots),
    })),
    snapshots,
    next_cursor:
      rows.length > input.limit && last
        ? encodeKeysetCursor('robots-history', filters, [pydanticUtc(last.observed_at), last.id])
        : null,
  };
}
