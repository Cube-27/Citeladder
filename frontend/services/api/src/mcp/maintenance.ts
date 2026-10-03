import type { Database } from '../db/database.ts';
import { mcpPolicy } from './config.ts';

/** Bound expired protocol storage; consumed consent/code audit and grants survive. */
export async function cleanupMcpProtocol(db: Database, now = new Date(), canAdmit = () => true) {
  let deleted = 0;
  for (const table of [
    'mcp_authorization_requests',
    'mcp_authorization_codes',
    'usage_windows',
  ] as const) {
    if (!canAdmit()) break;
    deleted += await db.transaction().execute(async (trx) => {
      let query = trx.selectFrom(table).select('id').where('expires_at', '<=', now);
      if (table !== 'usage_windows') query = query.where('consumed_at', 'is', null);
      const rows = await query
        .orderBy('expires_at')
        .limit(mcpPolicy.protocol_cleanup_batch)
        .forUpdate()
        .skipLocked()
        .execute();
      if (!rows.length) return 0;
      const result = await trx
        .deleteFrom(table)
        .where(
          'id',
          'in',
          rows.map((row) => row.id),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }
  return deleted;
}
