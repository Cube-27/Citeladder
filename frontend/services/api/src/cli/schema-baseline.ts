/**
 * The single schema baseline (docs/invariants.md 17): `migrations/0001_baseline.sql`
 * applied once, in one transaction, under an advisory lock, and recorded with
 * its SHA-256 in `schema_migrations`. Pre-launch policy folds every change into
 * the file, so a populated database that differs from it is replaced by the
 * deploy's reset option, never adapted in place.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type pg from 'pg';

const BASELINE_VERSION = '0001_baseline';
const BASELINE_FILE = new URL(`../../migrations/${BASELINE_VERSION}.sql`, import.meta.url);
const LOCK_KEY = createHash('sha256')
  .update('citeladder:schema-baseline')
  .digest()
  .readBigInt64BE(0);
const RESET = 'Redeploy with reset_database to replace this database with the current baseline.';

/** A database this baseline must not be applied to; the message is safe to print. */
export class BaselineRefusal extends Error {}

export function readBaseline(): string {
  return readFileSync(BASELINE_FILE, 'utf8');
}

/** Line endings are not schema: a CRLF checkout records the same checksum. */
function baselineChecksum(sqlText: string): string {
  return createHash('sha256').update(sqlText.replaceAll('\r\n', '\n')).digest('hex');
}

async function exists(client: pg.ClientBase, relation: string): Promise<boolean> {
  const result = await client.query('select 1 where to_regclass($1) is not null', [relation]);
  return result.rows.length > 0;
}

async function admission(client: pg.ClientBase, checksum: string): Promise<'current' | 'empty'> {
  if (await exists(client, 'public.schema_migrations')) {
    const ledger = await client.query<{ checksum: string }>(
      'select checksum from public.schema_migrations where version = $1',
      [BASELINE_VERSION],
    );
    if (ledger.rows[0]?.checksum === checksum) return 'current';
    throw new BaselineRefusal(
      `The schema baseline changed after this database was migrated (recorded ${ledger.rows[0]?.checksum.slice(0, 12) ?? 'none'}, file ${checksum.slice(0, 12)}). ${RESET}`,
    );
  }
  if (await exists(client, 'public.alembic_version'))
    throw new BaselineRefusal(
      `This database was created by the retired Alembic migrations. ${RESET}`,
    );
  const relations = await client.query(
    `select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') limit 1`,
  );
  if (relations.rows.length > 0)
    throw new BaselineRefusal(
      `The database has tables but no schema_migrations ledger, so the baseline was not applied over them. ${RESET}`,
    );
  return 'empty';
}

/** Apply the baseline to an empty database; a rerun on a current database is a no-op. */
export async function applyBaseline(
  client: pg.ClientBase,
  sqlText: string = readBaseline(),
): Promise<'applied' | 'current'> {
  const checksum = baselineChecksum(sqlText);
  await client.query('begin');
  try {
    await client.query('select pg_advisory_xact_lock($1::bigint)', [LOCK_KEY.toString()]);
    const state = await admission(client, checksum);
    if (state === 'empty') {
      await client.query(sqlText);
      await client.query(
        'insert into public.schema_migrations (version, checksum) values ($1, $2)',
        [BASELINE_VERSION, checksum],
      );
    }
    await client.query('commit');
    return state === 'empty' ? 'applied' : 'current';
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}
