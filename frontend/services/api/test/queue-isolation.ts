/**
 * Files share one disposable database in sequence, and unscoped workers claim
 * and backstop whatever is active there. Settle earlier files' active work so
 * each file starts from a quiescent queue rather than inheriting claimable rows
 * or running crawls that a backstop would finalize into new successors.
 */
import pg from 'pg';
import { beforeAll } from 'vitest';
import { policy } from '../src/config.ts';

const ACTIVE_CRAWL = ['draft', 'validating', 'queued', 'running'];

beforeAll(async () => {
  const url = process.env.API_TEST_DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const active = policy.task_queue.active;
    await client.query(
      `update site_crawls set status = 'failed', completed_at = coalesce(completed_at, now())
       where status = any($1::text[])`,
      [ACTIVE_CRAWL],
    );
    for (const table of ['site_crawl_tasks', 'analytics_tasks'])
      await client.query(
        `update ${table} set status = 'cancelled', lease_owner = null, lease_expires_at = null
         where status = any($1::text[])`,
        [active],
      );
  } finally {
    await client.end();
  }
});
