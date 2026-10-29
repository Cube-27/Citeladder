import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { ConsumableLedger } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { accountState, drawOrder } from './state.ts';
import { digest } from '../billing/contracts.ts';
import { getLogger } from '../logging.ts';
import { compareText } from '../text-order.ts';
import { chunksOf, isNonEmpty } from '../lists.ts';

export class LedgerError extends Error {}
export type Subject =
  | { kind: 'audit'; id: string; workspaceId: string; auditId: string }
  | { kind: 'agent' | 'site_crawl' | 'platform_call'; id: string; workspaceId: string };
type Entry = Selectable<ConsumableLedger>;
const logger = getLogger('api.entitlements');

/** The persisted audit ledger hashes compact JSON with sorted ASCII keys. */
function auditFingerprint(value: Record<string, string | number>) {
  return digest(Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareText(a, b))));
}

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
  const table = (
    { agent: 'agent_runs', site_crawl: 'site_crawls', platform_call: 'platform_calls' } as const
  )[subject.kind];
  return db
    .selectFrom(table)
    .select('id')
    .where('id', '=', subject.id)
    .where('workspace_id', '=', subject.workspaceId)
    .executeTakeFirst();
}

/**
 * Draws `units` from grants in draw order against their remaining balances,
 * counting what it draws as reserved so the next draw sees it.
 */
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
    if (take) {
      allocations.push({ grantId: grant.id, units: take });
      balances.set(grant.id, { ...balance, reserved: balance.reserved + take });
    }
    left -= take;
  }
  return { allocations, left };
}

type Hold = { subject: Subject; units: number; key: string };
// Rows per batched ledger statement, well under PostgreSQL's bind-parameter limit;
// chunks run in sequence because they share the caller's transaction.
const CHUNK = 500;

/** Callers pass their transaction and commit the hold before dispatch. */
export async function reserveUsage(
  db: Database,
  request: Hold & { accountId: string; capability: string; at: Date },
): Promise<string> {
  const { accountId, capability, at, ...hold } = request;
  const [reservationId] = await reserveUsages(db, { accountId, capability, at, holds: [hold] });
  return reservationId!;
}

/** Subjects missing under the lock: audit tasks in one query, the rest one by one. */
async function missingSubject(db: Database, subjects: readonly Subject[]) {
  const tasks = subjects.filter((subject) => subject.kind === 'audit');
  if (tasks.length) {
    const found = new Set<string>();
    for (const chunk of chunksOf(tasks, CHUNK)) {
      const ids = chunk.map((task) => task.id);
      const rows = await db // NOSONAR -- chunks share the transaction and its lock.
        .selectFrom('audit_tasks')
        .select(['id', 'audit_id', 'workspace_id'])
        .where('id', 'in', ids)
        .execute();
      for (const row of rows) found.add(`${row.id}:${row.audit_id}:${row.workspace_id}`);
    }
    if (tasks.some((task) => !found.has(`${task.id}:${task.auditId}:${task.workspaceId}`)))
      return true;
  }
  for (const subject of subjects)
    if (subject.kind !== 'audit' && !(await verifySubject(db, subject))) return true; // NOSONAR
  return false;
}

/**
 * Holds every request against one account under a single capacity lock, state
 * read and balance aggregate, allocating in order as if each were reserved
 * alone. Returns one reservation id per hold; any shortfall refuses them all.
 */
export async function reserveUsages(
  db: Database,
  request: { accountId: string; capability: string; at: Date; holds: readonly Hold[] },
): Promise<string[]> {
  const { accountId, capability, at, holds } = request;
  if (holds.some(({ units }) => !Number.isSafeInteger(units) || units <= 0))
    throw new LedgerError('reservation_units_invalid');
  if (!isNonEmpty(holds)) return [];
  const workspaceId = holds[0].subject.workspaceId;
  if (holds.some((hold) => hold.subject.workspaceId !== workspaceId))
    throw new LedgerError('reservation_workspace_mixed');
  if (new Set(holds.map((hold) => hold.key)).size !== holds.length)
    throw new LedgerError('idempotency_key_reused');
  await advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
  // After the lock, so a project deleted under it is never reserved against.
  const subjects = holds.map((hold) => hold.subject);
  if (await missingSubject(db, subjects)) throw new LedgerError('subject_not_found');
  const state = await accountState(db, workspaceId, accountId, at);
  const fingerprint = (hold: Hold) => holdFingerprint(accountId, capability, hold);
  const priors = await priorHolds(db, accountId, holds, fingerprint);
  const fresh = holds.filter((hold) => !priors.has(hold.key));
  const ids = fresh.length
    ? await reserveFresh(db, { accountId, capability, at, state, fingerprint }, fresh)
    : new Map<string, string>();
  return holds.map((hold) => priors.get(hold.key)?.reservation_id ?? ids.get(hold.key)!);
}

/**
 * Allocates and records the holds no prior entry covers, in order, so each
 * draws against what the earlier ones reserved. Any shortfall refuses them
 * all. Returns each hold's new reservation id by idempotency key.
 */
async function reserveFresh(
  db: Database,
  {
    accountId,
    capability,
    at,
    state,
    fingerprint,
  }: {
    accountId: string;
    capability: string;
    at: Date;
    state: Awaited<ReturnType<typeof accountState>>;
    fingerprint: (hold: Hold) => string;
  },
  fresh: readonly Hold[],
) {
  const ids = new Map<string, string>();
  const order = await lockedDrawOrder(db, { accountId, capability, state });
  const balances = await ledgerBalances(db, accountId);
  const rows = [];
  for (const hold of fresh) {
    const { allocations, left } = allocate(order, balances, hold.units);
    if (left) {
      logger.info('billing.consumable_credits_exhausted', {
        account_id: accountId,
        capability_key: capability,
        requested: hold.units,
        shortfall: left,
      });
      throw new LedgerError('funded_credits_exhausted');
    }
    const reservationId = randomUUID();
    ids.set(hold.key, reservationId);
    const context = { accountId, capability, at, reservationId, fingerprint: fingerprint(hold) };
    for (const [index, allocation] of allocations.entries())
      rows.push(reservationRow(hold, allocation, index, context));
  }
  for (const chunk of chunksOf(rows, CHUNK))
    await db.insertInto('consumable_ledger').values(chunk).execute(); // NOSONAR -- chunks share the transaction and its lock.
  return ids;
}

/** The request fingerprint an idempotent replay of this hold must repeat. */
function holdFingerprint(accountId: string, capability: string, { subject, units }: Hold) {
  return subject.kind === 'audit'
    ? auditFingerprint({
        account_id: accountId,
        capability_key: capability,
        subject_kind: 'audit',
        audit_id: subject.auditId,
        task_id: subject.id,
        units,
      })
    : digest({ accountId, subject, units, capability });
}

/** Holds already recorded under their idempotency keys; a key reused for another request throws. */
async function priorHolds(
  db: Database,
  accountId: string,
  holds: readonly Hold[],
  fingerprint: (hold: Hold) => string,
) {
  const priors = new Map<string, Entry>();
  for (const keys of chunksOf(
    holds.map((hold) => hold.key),
    CHUNK,
  ))
    for (const row of await db // NOSONAR -- chunks share the transaction and its lock.
      .selectFrom('consumable_ledger')
      .selectAll()
      .where('billing_account_id', '=', accountId)
      .where('idempotency_key', 'in', keys)
      .execute())
      priors.set(row.idempotency_key, row);
  for (const hold of holds) {
    const prior = priors.get(hold.key);
    if (prior && prior.request_fingerprint !== fingerprint(hold))
      throw new LedgerError('idempotency_key_reused');
  }
  return priors;
}

/** The capability's grants locked in UUID order and returned in draw (expiry) order. */
async function lockedDrawOrder(
  db: Database,
  {
    accountId,
    capability,
    state,
  }: { accountId: string; capability: string; state: Awaited<ReturnType<typeof accountState>> },
) {
  if (state.error) throw new LedgerError('entitlement_unresolved');
  const candidates = state.selected.filter((grant) => grant.key === capability);
  if (
    policy.entitlements.capabilities[capability as keyof typeof policy.entitlements.capabilities]
      ?.type !== 'counter.consumable'
  )
    throw new LedgerError('capability_not_consumable');
  // Lock UUID order, allocate expiry order.
  const grantIds = candidates.map((grant) => grant.id).sort((a, b) => a.localeCompare(b));
  if (grantIds.length)
    await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', accountId)
      .where('id', 'in', grantIds)
      .orderBy('id')
      .forUpdate()
      .execute();
  return drawOrder(candidates, state.end);
}

/** One grant's share of a reservation as a ledger row. */
function reservationRow(
  { subject, key }: Hold,
  allocation: { grantId: string; units: number },
  index: number,
  context: {
    accountId: string;
    capability: string;
    at: Date;
    reservationId: string;
    fingerprint: string;
  },
) {
  return {
    id: randomUUID(),
    billing_account_id: context.accountId,
    workspace_id: subject.workspaceId,
    grant_id: allocation.grantId,
    capability_key: context.capability,
    units: allocation.units,
    entry_kind: 'reservation',
    reservation_id: context.reservationId,
    subject_kind: subject.kind,
    subject_id: subject.id,
    ...subjectColumns(subject),
    dispatch_key: 'reservation',
    allocation_order: index,
    request_fingerprint: context.fingerprint,
    refund_of_id: null,
    attempt: null,
    idempotency_key: index === 0 ? key : `${key}#${allocation.grantId}`,
    created_at: context.at,
  };
}

/** The typed subject reference columns; only the subject's own kind is set. */
function subjectColumns(subject: Subject) {
  return {
    audit_id: subject.kind === 'audit' ? subject.auditId : null,
    task_id: subject.kind === 'audit' ? subject.id : null,
    agent_run_id: subject.kind === 'agent' ? subject.id : null,
    site_crawl_id: subject.kind === 'site_crawl' ? subject.id : null,
    platform_call_id: subject.kind === 'platform_call' ? subject.id : null,
  };
}

/** Units a reservation still holds: reserved minus released (debits release their units). */
export const openReservedUnits = sql<number>`sum(case when entry_kind = 'reservation' then units when entry_kind = 'release' then -units else 0 end)`;

/**
 * Whether an audit, crawl or Agent run of the project still holds reserved
 * units. Deleting the project then would leave a hold nothing can release, so
 * the units would stay reserved for good.
 */
export async function projectHoldsReservations(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const subject = (
    kind: 'audit' | 'agent' | 'site_crawl',
    table: 'audits' | 'agent_runs' | 'site_crawls',
  ) =>
    db
      .selectFrom('consumable_ledger')
      .select('reservation_id')
      .where('subject_kind', '=', kind)
      .where(
        'subject_id',
        'in',
        db.selectFrom(table).select('id').where('project_id', '=', projectId),
      );
  const open = await db
    .selectFrom('consumable_ledger')
    .select('reservation_id')
    .where('workspace_id', '=', workspaceId)
    .where('reservation_id', 'in', (eb) =>
      eb
        .selectFrom(
          subject('audit', 'audits')
            .union(subject('agent', 'agent_runs'))
            .union(subject('site_crawl', 'site_crawls'))
            .as('held'),
        )
        .select('held.reservation_id'),
    )
    .groupBy('reservation_id')
    .having(openReservedUnits, '>', 0)
    .limit(1)
    .executeTakeFirst();
  return open !== undefined;
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
  if (!isNonEmpty(holds)) throw new LedgerError('reservation_not_found');
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
  if (holds[0].subject_id !== subjectId) throw new LedgerError('reservation_subject_mismatch');
  const fingerprint =
    holds[0].subject_kind === 'audit'
      ? auditFingerprint({ reservation_id: reservationId, subject_id: subjectId, attempt, units })
      : digest({ reservationId, subjectId, attempt, dispatchKey, units });
  const prior = rows.find(
    (row) =>
      row.entry_kind === 'debit' &&
      (row.idempotency_key === `${key}:debit:${row.grant_id}` ||
        (holds[0].subject_kind === 'audit'
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
