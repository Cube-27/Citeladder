import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { ConsumableLedger } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { accountState, drawOrder } from './state.ts';
import { digest } from '../billing/contracts.ts';
import { getLogger } from '../logging.ts';

class LedgerError extends Error {}
export type Subject =
  | { kind: 'audit'; id: string; workspaceId: string; auditId: string }
  | { kind: 'agent' | 'site_crawl'; id: string; workspaceId: string };
type Entry = Selectable<ConsumableLedger>;
const logger = getLogger('api.entitlements');

function verifySubject(db: Database, subject: Subject) {
  if (subject.kind === 'audit') {
    return db
      .selectFrom('audit_tasks')
      .select('id')
      .where('id', '=', subject.id)
      .where('audit_id', '=', subject.auditId)
      .where('workspace_id', '=', subject.workspaceId)
      .executeTakeFirst();
  }
  const table = subject.kind === 'agent' ? 'agent_runs' : 'site_crawls';
  return db
    .selectFrom(table)
    .select('id')
    .where('id', '=', subject.id)
    .where('workspace_id', '=', subject.workspaceId)
    .executeTakeFirst();
}

/** Draws `units` from grants in draw order against their remaining balances. */
function allocate(
  grants: readonly { id: string; value: number }[],
  balances: Map<string, { reserved: number; consumed: number }>,
  units: number,
) {
  let left = units;
  const allocations: { grantId: string; units: number }[] = [];
  for (const grant of grants) {
    const balance = balances.get(grant.id) ?? { reserved: 0, consumed: 0 };
    const take = Math.min(left, Math.max(0, grant.value - balance.reserved - balance.consumed));
    if (take) allocations.push({ grantId: grant.id, units: take });
    left -= take;
  }
  return { allocations, left };
}

/** Callers pass their transaction and commit the hold before dispatch. */
export async function reserveUsage(
  db: Database,
  request: {
    accountId: string;
    capability: string;
    subject: Subject;
    units: number;
    key: string;
    at: Date;
  },
): Promise<string> {
  const { accountId, subject, units, capability, key, at } = request;
  if (!Number.isSafeInteger(units) || units <= 0)
    throw new LedgerError('reservation_units_invalid');
  if (!(await verifySubject(db, subject))) throw new LedgerError('subject_not_found');
  await advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
  const state = await accountState(db, subject.workspaceId, accountId, at);
  const fingerprint = digest({ accountId, subject, units, capability });
  const prior = await db
    .selectFrom('consumable_ledger')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) throw new LedgerError('idempotency_key_reused');
    return prior.reservation_id;
  }
  if (state.error) throw new LedgerError('entitlement_unresolved');
  const candidates = state.selected.filter((grant) => grant.key === capability);
  if (
    policy.entitlements.capabilities[capability as keyof typeof policy.entitlements.capabilities]
      ?.type !== 'counter.consumable'
  )
    throw new LedgerError('capability_not_consumable');
  // Lock UUID order (as Python's ledger bridge does), allocate expiry order.
  const ids = candidates.map((grant) => grant.id).sort((a, b) => a.localeCompare(b));
  if (ids.length)
    await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', accountId)
      .where('id', 'in', ids)
      .orderBy('id')
      .forUpdate()
      .execute();
  const { allocations, left } = allocate(
    drawOrder(candidates, state.end),
    await ledgerBalances(db, accountId),
    units,
  );
  if (left) {
    logger.info('billing.consumable_credits_exhausted', {
      account_id: accountId,
      capability_key: capability,
      requested: units,
      shortfall: left,
    });
    throw new LedgerError('funded_credits_exhausted');
  }
  const reservationId = randomUUID();
  await db
    .insertInto('consumable_ledger')
    .values(
      allocations.map((allocation, index) => ({
        id: randomUUID(),
        billing_account_id: accountId,
        workspace_id: subject.workspaceId,
        grant_id: allocation.grantId,
        capability_key: capability,
        units: allocation.units,
        entry_kind: 'reservation',
        reservation_id: reservationId,
        subject_kind: subject.kind,
        subject_id: subject.id,
        audit_id: subject.kind === 'audit' ? subject.auditId : null,
        task_id: subject.kind === 'audit' ? subject.id : null,
        agent_run_id: subject.kind === 'agent' ? subject.id : null,
        site_crawl_id: subject.kind === 'site_crawl' ? subject.id : null,
        dispatch_key: 'reservation',
        allocation_order: index,
        request_fingerprint: fingerprint,
        refund_of_id: null,
        attempt: null,
        idempotency_key: index === 0 ? key : `${key}#${allocation.grantId}`,
        created_at: at,
      })),
    )
    .execute();
  return reservationId;
}

export async function ledgerBalances(db: Database, accountId: string) {
  const rows = await db
    .selectFrom('consumable_ledger')
    .select(['grant_id', 'entry_kind', sql<string>`sum(units)`.as('units')])
    .where('billing_account_id', '=', accountId)
    .groupBy(['grant_id', 'entry_kind'])
    .execute();
  const balances = new Map<string, { reserved: number; consumed: number }>();
  for (const row of rows) {
    const value = balances.get(row.grant_id) ?? { reserved: 0, consumed: 0 };
    const units = Number(row.units);
    if (!Number.isSafeInteger(units)) throw new LedgerError('ledger_balance_overflow');
    if (row.entry_kind === 'reservation') value.reserved += units;
    else if (row.entry_kind === 'release') value.reserved -= units;
    else if (row.entry_kind === 'debit') value.consumed += units;
    else if (row.entry_kind === 'refund') value.consumed -= units;
    else throw new LedgerError('ledger_entry_kind_invalid');
    balances.set(row.grant_id, value);
  }
  return balances;
}

async function reservation(db: Database, workspaceId: string, accountId: string, id: string) {
  await advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
  const rows = await db
    .selectFrom('consumable_ledger')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('billing_account_id', '=', accountId)
    .where('reservation_id', '=', id)
    .orderBy('allocation_order')
    .orderBy('id')
    .forUpdate()
    .execute();
  const holds = rows.filter((row) => row.entry_kind === 'reservation');
  if (!holds.length) throw new LedgerError('reservation_not_found');
  const released = new Map<string, number>();
  for (const row of rows)
    if (row.entry_kind === 'release')
      released.set(row.grant_id, (released.get(row.grant_id) ?? 0) + row.units);
  return { rows, holds, released };
}

/** A derived ledger row: the parent's identity with this entry's facts. */
function entry(
  base: Entry,
  facts: {
    kind: string;
    units: number;
    key: string;
    at: Date;
    fingerprint: string;
    dispatch: string;
    attempt: number | null;
  },
) {
  return {
    ...base,
    id: randomUUID(),
    entry_kind: facts.kind,
    units: facts.units,
    idempotency_key: facts.key,
    created_at: facts.at,
    request_fingerprint: facts.fingerprint,
    dispatch_key: facts.dispatch,
    attempt: facts.attempt,
  };
}

export async function debitUsage(
  db: Database,
  request: {
    workspaceId: string;
    accountId: string;
    reservationId: string;
    subjectId: string;
    attempt: number;
    units: number;
    key: string;
    dispatchKey: string;
    at: Date;
  },
) {
  const { workspaceId, accountId, reservationId, subjectId, attempt, units, key, dispatchKey, at } =
    request;
  if (!Number.isSafeInteger(units) || units <= 0 || !Number.isSafeInteger(attempt) || attempt <= 0)
    throw new LedgerError('debit_units_invalid');
  const { rows, holds, released } = await reservation(db, workspaceId, accountId, reservationId);
  if (holds[0]!.subject_id !== subjectId) throw new LedgerError('reservation_subject_mismatch');
  const fingerprint = digest({ reservationId, subjectId, attempt, dispatchKey, units });
  const prior = rows.find(
    (row) =>
      row.entry_kind === 'debit' &&
      (row.idempotency_key === `${key}:debit:${row.grant_id}` ||
        (holds[0]!.subject_kind === 'audit'
          ? row.attempt === attempt
          : row.dispatch_key === dispatchKey)),
  );
  if (prior) {
    if (prior.request_fingerprint !== fingerprint) throw new LedgerError('idempotency_key_reused');
    return;
  }
  let left = units;
  const allocations = holds.map((row) => {
    const take = Math.min(left, Math.max(0, row.units - (released.get(row.grant_id) ?? 0)));
    left -= take;
    return { row, units: take };
  });
  if (left) throw new LedgerError('reservation_exhausted');
  const facts = { at, fingerprint, dispatch: dispatchKey };
  const entries = allocations
    .filter((item) => item.units)
    .flatMap(({ row, units: taken }) => [
      entry(row, {
        ...facts,
        kind: 'release',
        units: taken,
        key: `${key}:release:${row.grant_id}`,
        attempt: null,
      }),
      entry(row, {
        ...facts,
        kind: 'debit',
        units: taken,
        key: `${key}:debit:${row.grant_id}`,
        attempt,
      }),
    ]);
  if (entries.length) await db.insertInto('consumable_ledger').values(entries).execute();
}

export async function releaseUsage(
  db: Database,
  request: { workspaceId: string; accountId: string; reservationId: string; key: string; at: Date },
) {
  const { workspaceId, accountId, reservationId, key, at } = request;
  const { holds, released } = await reservation(db, workspaceId, accountId, reservationId);
  const entries = holds.flatMap((row) => {
    const units = row.units - (released.get(row.grant_id) ?? 0);
    if (units <= 0) return [];
    return [
      entry(row, {
        kind: 'release',
        units,
        key: `${key}:${row.grant_id}`,
        at,
        fingerprint: digest({ reservationId, grantId: row.grant_id, units }),
        dispatch: 'release',
        attempt: null,
      }),
    ];
  });
  if (entries.length) await db.insertInto('consumable_ledger').values(entries).execute();
}

/** Append a bounded refund against a particular immutable debit. */
export async function refundUsage(
  db: Database,
  request: {
    workspaceId: string;
    accountId: string;
    debitId: string;
    units: number;
    key: string;
    at: Date;
  },
) {
  if (!Number.isSafeInteger(request.units) || request.units <= 0)
    throw new LedgerError('refund_units_invalid');
  await advisoryXactLock(db, policy.entitlements.capacity_lock, request.accountId);
  const debit = await db
    .selectFrom('consumable_ledger')
    .selectAll()
    .where('workspace_id', '=', request.workspaceId)
    .where('billing_account_id', '=', request.accountId)
    .where('id', '=', request.debitId)
    .where('entry_kind', '=', 'debit')
    .forUpdate()
    .executeTakeFirst();
  if (!debit) throw new LedgerError('debit_not_found');
  const fingerprint = digest({ debitId: debit.id, units: request.units });
  const prior = await db
    .selectFrom('consumable_ledger')
    .selectAll()
    .where('billing_account_id', '=', request.accountId)
    .where('idempotency_key', '=', request.key)
    .executeTakeFirst();
  if (prior) {
    if (prior.entry_kind !== 'refund' || prior.request_fingerprint !== fingerprint)
      throw new LedgerError('idempotency_key_reused');
    return;
  }
  const total = await db
    .selectFrom('consumable_ledger')
    .select(sql<string>`coalesce(sum(units),0)`.as('units'))
    .where('billing_account_id', '=', request.accountId)
    .where('refund_of_id', '=', debit.id)
    .where('entry_kind', '=', 'refund')
    .executeTakeFirstOrThrow();
  if (Number(total.units) + request.units > debit.units)
    throw new LedgerError('refund_exceeds_debit');
  await db
    .insertInto('consumable_ledger')
    .values({
      ...debit,
      id: randomUUID(),
      entry_kind: 'refund',
      refund_of_id: debit.id,
      units: request.units,
      idempotency_key: request.key,
      request_fingerprint: fingerprint,
      created_at: request.at,
    })
    .execute();
}
