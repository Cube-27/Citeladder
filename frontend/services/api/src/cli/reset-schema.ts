import pg from 'pg';

import { localEnvironment } from './local-environment.ts';
import { operatorMain } from './operator.ts';
import { resetTarget } from './reset-sequence.ts';
import { applyMigrations, migrationClient, migrationSummary } from './schema-migrations.ts';

/** Drop and recreate one authorized database, then apply every migration. */
await operatorMain(async () => {
  const env = localEnvironment();
  const target = resetTarget(env);
  const quoted = `"${target.database.replaceAll('"', '""')}"`;
  const admin = new pg.Client({
    connectionString: target.adminUrl,
    connectionTimeoutMillis: 30000,
  });
  await admin.connect();
  try {
    console.log(`Dropping and recreating database '${target.database}'...`);
    await admin.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoted}`);
  } finally {
    await admin.end();
  }
  const schema = migrationClient(target.databaseUrl, env);
  await schema.connect();
  try {
    console.log(migrationSummary(await applyMigrations(schema)));
  } finally {
    await schema.end();
  }
});
