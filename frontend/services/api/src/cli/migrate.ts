import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import type pg from 'pg';

import { OperatorRefusal, operatorDiagnostic } from './operator.ts';
import {
  applyMigrations,
  appRolePassword,
  convergeAppRole,
  ensureEvidencePartitions,
  migrationClient,
  migrationSummary,
} from './schema-migrations.ts';

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
    const skipped = await ensureEvidencePartitions(client);
    if (skipped.length) console.warn(`Evidence partitions skipped: ${skipped.join('; ')}.`);
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(operatorDiagnostic(error));
  process.exitCode = 1;
}
