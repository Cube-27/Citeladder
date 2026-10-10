import pg from 'pg';

import { localEnvironment } from './local-environment.ts';
import { resetTarget, ResetRefusal } from './reset-sequence.ts';
import { applyBaseline } from './schema-baseline.ts';

/** Drop and recreate one authorized database, then apply the SQL baseline. */
async function main() {
  const target = resetTarget(localEnvironment());
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
  const schema = new pg.Client({ connectionString: target.databaseUrl });
  await schema.connect();
  try {
    console.log(`Schema baseline ${await applyBaseline(schema)}.`);
  } finally {
    await schema.end();
  }
}

try {
  await main();
} catch (error) {
  // Connection and driver errors can carry credentials; print only their type.
  console.error(
    `Database reset failed: ${error instanceof ResetRefusal ? error.message : error instanceof Error ? error.constructor.name : 'Error'}`,
  );
  process.exitCode = 1;
}
