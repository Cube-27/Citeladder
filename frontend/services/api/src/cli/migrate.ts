import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { databaseSettings } from '../config.ts';
import { poolOptions } from '../db/database.ts';
import { applyBaseline, BaselineRefusal } from './schema-baseline.ts';

function migrationClient(databaseUrl: string) {
  return new pg.Client({
    ...poolOptions({
      appName: 'CiteLadder migrate',
      databaseUrl,
      database: databaseSettings(process.env),
    }),
    // DDL for an empty database: no request-path statement or query bound applies,
    // and a concurrent migrate waits on the advisory lock instead of failing.
    statement_timeout: 0,
    lock_timeout: 0,
    query_timeout: undefined,
  });
}

/** A fresh or replaced database VM may still be starting; retry the connection until the deadline. */
async function connect(databaseUrl: string, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const client = migrationClient(databaseUrl);
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (Date.now() >= deadline) throw error;
      await sleep(5000);
    }
  }
}

/** The migrate job's schema step: apply or confirm the SQL baseline, then exit. */
async function main() {
  const { values } = parseArgs({ options: { 'wait-seconds': { type: 'string', default: '0' } } });
  const waitSeconds = Number(values['wait-seconds']);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0)
    throw new BaselineRefusal('--wait-seconds must be a non-negative number.');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new BaselineRefusal('DATABASE_URL is required.');
  const client = await connect(databaseUrl, waitSeconds);
  try {
    console.log(`Schema baseline ${await applyBaseline(client)}.`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  // Refusals are reviewed text; anything else prints only its type and SQLSTATE.
  const code = error instanceof Error && 'code' in error ? ` ${String(error.code)}` : '';
  console.error(
    error instanceof BaselineRefusal
      ? error.message
      : `Schema migration failed: ${error instanceof Error ? error.constructor.name : 'Error'}${code}`,
  );
  process.exitCode = 1;
}
