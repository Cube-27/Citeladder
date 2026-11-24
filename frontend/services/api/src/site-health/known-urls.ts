import { sql, type RawBuilder } from 'kysely';

import type { Database } from '../db/database.ts';
import type { KnownUrls } from './analysis/measurement-aggregation.ts';
import { inventoryCrawlIds } from './reads/crawl.ts';
import type { Crawl } from './site-task.ts';

function latestKinds(crawl: Crawl) {
  const lineage = inventoryCrawlIds(crawl);
  return sql`
    select distinct on (o.site_url_id) o.site_url_id, o.value_kind
    from site_url_observations o
    where o.workspace_id = ${crawl.workspace_id} and o.project_id = ${crawl.project_id}
      and o.crawl_id = any(${lineage}::uuid[]) and o.value_kind <> ''
    order by o.site_url_id, array_position(${lineage}::uuid[], o.crawl_id)`;
}

export function urlKindSql(crawl: Crawl, siteUrlId: RawBuilder<unknown>) {
  const lineage = inventoryCrawlIds(crawl);
  return sql<string | null>`(select o.value_kind from site_url_observations o
    where o.workspace_id = ${crawl.workspace_id} and o.project_id = ${crawl.project_id}
      and o.site_url_id = ${siteUrlId} and o.crawl_id = any(${lineage}::uuid[])
      and o.value_kind <> ''
    order by array_position(${lineage}::uuid[], o.crawl_id) limit 1)`;
}

export async function knownUrlsByKind(db: Database, crawl: Crawl): Promise<KnownUrls> {
  const { rows } = await sql<{ kind: string; urls: number }>`
    select k.value_kind as kind, count(*)::int as urls
    from (${latestKinds(crawl)}) k group by k.value_kind`.execute(db);
  return new Map(rows.map((row) => [row.kind, row.urls]));
}
