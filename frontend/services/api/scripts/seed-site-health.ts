/** Local dev seeder bridge; reuse the crawl owner without exposing an HTTP writer. */
import { loadConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/database.ts';
import { createCrawl } from '../src/site-health/planner.ts';
import { bulkMonitoredSet } from '../src/site-health/selection.ts';
import { z } from 'zod';

const config = loadConfig();
const target = new URL(config.databaseUrl.replace('postgresql+asyncpg:', 'postgresql:'));
if (
  config.appEnv !== 'development' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
)
  throw new Error('Site Health seed admission requires a local development database');
let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += String(chunk);
const input = z
  .discriminatedUnion('operation', [
    z.strictObject({
      operation: z.literal('create'),
      workspace_id: z.uuid(),
      project_id: z.uuid(),
      seed: z.string(),
    }),
    z.strictObject({
      operation: z.literal('select'),
      workspace_id: z.uuid(),
      project_id: z.uuid(),
      crawl_id: z.uuid(),
    }),
  ])
  .parse(JSON.parse(raw));
const db = createDatabase(config);
try {
  const id = await db.transaction().execute(async (trx) => {
    if (input.operation === 'create')
      return (
        await createCrawl(trx, input.workspace_id, {
          project_id: input.project_id,
          seed: input.seed,
        })
      ).id;
    const profile = await trx
      .selectFrom('site_health_profiles')
      .select('selection_version')
      .where('workspace_id', '=', input.workspace_id)
      .where('project_id', '=', input.project_id)
      .executeTakeFirstOrThrow();
    await bulkMonitoredSet(trx, input.workspace_id, input.project_id, {
      crawl_id: input.crawl_id,
      mode: 'all',
      expected_selection_version: profile.selection_version,
    });
    return input.crawl_id;
  });
  process.stdout.write(`${JSON.stringify({ id })}\n`);
} finally {
  await db.destroy();
}
