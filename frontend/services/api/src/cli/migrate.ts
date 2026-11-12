import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import type pg from 'pg';

import { OperatorRefusal, operatorDiagnostic } from './operator.ts';
import {
  applyMigrations,
  appRolePassword,
  convergeAppRole,
  migrationClient,
  migrationSummary,
} from './schema-migrations.ts';

/** A fresh or replaced database VM may still be starting; retry the connection until the deadline. */
async function connect(databaseUrl: string, deadline: number): Promise<pg.Client> {
  const client = migrationClient(databaseUrl);
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => undefined);
    if (Date.now() >= deadline) throw error;
    await sleep(5000);
    return connect(databaseUrl, deadline);
  }
}

/**
 * The migrate job's schema step: as the schema owner (`MIGRATION_DATABASE_URL`),
 * apply the pending migrations, or confirm none, then let the application role
 * log in with the password in the services' `DATABASE_URL`, and exit.
 */
async function main() {
  const { values } = parseArgs({ options: { 'wait-seconds': { type: 'string', default: '0' } } });
  const waitSeconds = Number(values['wait-seconds']);
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0)
    throw new OperatorRefusal('--wait-seconds must be a non-negative number.');
  const ownerUrl = process.env.MIGRATION_DATABASE_URL?.trim();
  if (!ownerUrl) throw new OperatorRefusal('MIGRATION_DATABASE_URL is required.');
  const appUrl = process.env.DATABASE_URL?.trim();
  if (!appUrl) throw new OperatorRefusal('DATABASE_URL is required.');
  const password = appRolePassword(appUrl);
  const client = await connect(ownerUrl, Date.now() + waitSeconds * 1000);
  try {
    console.log(migrationSummary(await applyMigrations(client)));
    await convergeAppRole(client, password);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  // The shared operator redaction already names a failed statement's SQLSTATE.
  console.error(operatorDiagnostic(error));
  process.exitCode = 1;
}
