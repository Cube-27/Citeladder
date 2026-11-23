import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

import pg from 'pg';

import { databaseSettings, migrationTimeouts } from '../config.ts';
import { APP_DATABASE_ROLE, poolOptions } from '../db/database.ts';
import { OperatorRefusal } from './operator.ts';

export type Migration = { version: string; sql: string };

const DIRECTORY = new URL('../../migrations/', import.meta.url);
const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/u;
const LOCK_KEY = createHash('sha256')
  .update('citeladder:schema-baseline')
  .digest()
  .readBigInt64BE(0);
const RESET = 'Redeploy with reset_database to replace this disposable database.';

export function readMigrations(): Migration[] {
  const names = readdirSync(DIRECTORY)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  return names.map((name, index) => {
    const number = FILE_NAME.exec(name)?.[1];
    if (Number(number) !== index + 1)
      throw new TypeError(`Migration ${name} breaks the numbered sequence 0001, 0002, …`);
    return {
      version: name.slice(0, -'.sql'.length),
      sql: readFileSync(new URL(name, DIRECTORY), 'utf8'),
    };
  });
}

function checksum(sqlText: string): string {
  return createHash('sha256').update(sqlText).digest('hex');
}

async function exists(client: pg.ClientBase, relation: string): Promise<boolean> {
  const result = await client.query('select 1 where to_regclass($1) is not null', [relation]);
  return result.rows.length > 0;
}

async function pending(client: pg.ClientBase, migrations: Migration[]): Promise<Migration[]> {
  if (await exists(client, 'public.schema_migrations')) {
    const ledger = await client.query<{ version: string; checksum: string }>(
      'select version, checksum from public.schema_migrations order by version',
    );
    const recorded = new Map(ledger.rows.map((row) => [row.version, row.checksum]));
    for (const [version, stored] of recorded) {
      const file = migrations.find((migration) => migration.version === version);
      if (!file)
        throw new OperatorRefusal(
          `This database recorded migration ${version}, which this release does not contain. Deploy a release that includes it.`,
        );
      const current = checksum(file.sql);
      if (current !== stored)
        throw new OperatorRefusal(
          `Migration ${version} changed after this database applied it (recorded ${stored.slice(0, 12)}, file ${current.slice(0, 12)}). An applied migration never changes: restore it and add the change as a new numbered migration.`,
        );
    }
    const next = migrations.findIndex((migration) => !recorded.has(migration.version));
    const rest = next < 0 ? [] : migrations.slice(next);
    if (rest.some((migration) => recorded.has(migration.version)))
      throw new OperatorRefusal(
        `This database skipped migration ${migrations[next]?.version}, so later ones cannot apply over it.`,
      );
    return rest;
  }
  const relations = await client.query(
    `select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') limit 1`,
  );
  if (relations.rows.length > 0)
    throw new OperatorRefusal(
      `The database has tables but no schema_migrations ledger, so migrations were not applied over them. ${RESET}`,
    );
  return migrations;
}

export function migrationClient(
  databaseUrl: string,
  env: Record<string, string | undefined> = process.env,
) {
  const timeouts = migrationTimeouts(env);
  return new pg.Client({
    ...poolOptions({ appName: 'CiteLadder migrate', databaseUrl, database: databaseSettings(env) }),
    query_timeout: undefined,
    statement_timeout: timeouts.statementTimeoutMs,
    lock_timeout: timeouts.lockTimeoutMs,
  });
}

export async function applyMigrations(
  client: pg.ClientBase,
  migrations: Migration[] = readMigrations(),
): Promise<string[]> {
  await client.query('begin');
  try {
    await client.query('set local statement_timeout = 0; set local lock_timeout = 0');
    await client.query('select pg_advisory_xact_lock($1::bigint)', [LOCK_KEY.toString()]);
    const bounds = 'reset statement_timeout; reset lock_timeout';
    await client.query(bounds);
    const todo = await pending(client, migrations);
    for (const migration of todo) await client.query(`${migration.sql}\n;${bounds}`); // NOSONAR
    if (todo.length)
      await client.query(
        'insert into public.schema_migrations (version, checksum) select * from unnest($1::text[], $2::text[])',
        [todo.map((m) => m.version), todo.map((m) => checksum(m.sql))],
      );
    await client.query('commit');
    return todo.map((migration) => migration.version);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

export async function ensureEvidencePartitions(client: pg.ClientBase): Promise<string[]> {
  const { rows: targets } = await client.query<{ evidence_table: string; evidence_month: string }>(
    "select evidence_table, to_char(evidence_month, 'YYYY-MM-DD') as evidence_month from public.site_evidence_partition_targets()",
  );
  const skipped: string[] = [];
  for (const { evidence_table: table, evidence_month: month } of targets) {
    const { rows } = await client.query<{ outcome: string }>( // NOSONAR
      'select public.site_evidence_month_partition($1, $2::date) as outcome',
      [table, month],
    );
    const outcome = rows[0]?.outcome;
    if (outcome !== 'created' && outcome !== 'exists')
      skipped.push(`${table} ${month.slice(0, 7)}: ${outcome}`);
  }
  await client.query(`do $$ declare parent regclass; begin
    for parent in select partrelid from pg_partitioned_table loop
      execute format('analyze %s', parent);
    end loop; end $$`);
  return skipped;
}

function scramVerifier(password: string): string {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  const b64 = (bytes: Buffer) => bytes.toString('base64');
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

export function appRolePassword(appDatabaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(appDatabaseUrl);
  } catch {
    throw new OperatorRefusal('DATABASE_URL is not a valid URL.');
  }
  if (decodeURIComponent(url.username) !== APP_DATABASE_ROLE)
    throw new OperatorRefusal(`DATABASE_URL must connect as the ${APP_DATABASE_ROLE} role.`);
  const password = decodeURIComponent(url.password);
  if (!/^[\x20-\x7e]+$/u.test(password))
    throw new OperatorRefusal('The DATABASE_URL password must be non-empty printable ASCII.');
  return password;
}

export async function convergeAppRole(client: pg.ClientBase, password: string) {
  const verifier = client.escapeLiteral(scramVerifier(password));
  await client.query(`alter role ${APP_DATABASE_ROLE} with login password ${verifier}`);
}

export function migrationSummary(applied: readonly string[]) {
  return applied.length ? `Schema migrations applied: ${applied.join(', ')}.` : 'Schema current.';
}
