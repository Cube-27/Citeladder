import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import type { Database } from '../db/database.ts';
import type { ConsumableLedger } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import { advisoryXactLock } from '../db/advisory-lock.ts';
import { accountState, drawOrder } from './state.ts';
import { digest } from '../crypto-text.ts';
import { getLogger } from '../logging.ts';
import { compareText } from '../text-order.ts';
import { chunksOf, isNonEmpty } from '../lists.ts';

export type LedgerCode =
  | 'account_not_found'
  | 'capability_not_consumable'
  | 'entitlement_unresolved'
  | 'funded_credits_exhausted'
  | 'idempotency_key_reused'
  | 'ledger_balance_overflow'
  | 'ledger_entry_kind_invalid'
  | 'reservation_not_found'
  | 'reservation_units_invalid'
  | 'reservation_workspace_mixed'
  | 'settle_units_invalid'
  | 'subject_not_found';

export class LedgerError extends Error {
  readonly code: LedgerCode;
  constructor(code: LedgerCode) {
    super(code);
    this.code = code;
  }
}

export type AgentSubject = { kind: 'agent'; id: string; workspaceId: string };
export type Subject =
  | { kind: 'audit'; id: string; workspaceId: string; auditId: string }
  | AgentSubject
  | { kind: 'site_crawl' | 'platform_call'; id: string; workspaceId: string };
export type Hold =
  | { subject: Exclude<Subject, AgentSubject>; units: number }
  | { subject: AgentSubject; units: number; dispatchId: string };
type Entry = Selectable<ConsumableLedger>;
const logger = getLogger('api.entitlements');

export function capacityLock(db: Database, accountId: string) {
  return advisoryXactLock(db, policy.entitlements.capacity_lock, accountId);
}

export async function billingAccountId(db: Database, workspaceId: string) {
  const row = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  return row?.id;
}

/** The persisted audit ledger hashes compact JSON with sorted ASCII keys. */
function auditFingerprint(value: Record<string, string | number>) {
  return digest(Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareText(a, b))));
}

function holdKey(hold: Hold) {
  if ('dispatchId' in hold) return `agent:${hold.dispatchId}:hold`;
  switch (hold.subject.kind) {
    case 'audit':
      return `run:${hold.subject.id}`;
    case 'platform_call':
      return `call:${hold.subject.id}`;
    case 'site_crawl':
      return `site-crawl-fetches:${hold.subject.id}`;
    default: {
      const _exhaustive: never = hold.subject;
      return _exhaustive;
    }
  }
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

function allocate(
  grants: readonly { id: string; value: number }[],
  balances: Map<string, { reserved: number; consumed: number }>,
  units: number,
) {
  let left = units;
  const allocations: { grantId: string; units: number }[] = [];
  for (const grant of grants) {
    const take = Math.min(left, grantRemaining(grant, balances));
    if (take) {
      const balance = balances.get(grant.id) ?? { reserved: 0, consumed: 0 };
      allocations.push({ grantId: grant.id, units: take });
      balances.set(grant.id, { ...balance, reserved: balance.reserved + take });
    }
    left -= take;
  }
  return { allocations, left };
}

type KeyedHold = Hold & { key: string };
// Rows per batched ledger statement, well under PostgreSQL's bind-parameter limit;
// chunks run in sequence because they share the caller's transaction.
const CHUNK = 500;

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
    if (subject.kind !== 'audit' && !(await verifySubject(db, subject))) return true; // NOSONAR -- Stops at the first unverifiable subject.
  return false;
}

/**
 * Holds one request for the subject's workspace account. Callers pass their
 * transaction and commit the hold before network I/O.
 */
export async function hold(
  db: Database,
  request: Hold & { capability: string; at: Date },
): Promise<{ accountId: string; reservationId: string }> {
  const { capability, at, ...one } = request;
  const { accountId, reservationIds } = await holdAll(db, {
    workspaceId: one.subject.workspaceId,
    capability,
    at,
    holds: [one],
  });
  const [reservationId] = reservationIds;
  if (!reservationId) throw new LedgerError('reservation_not_found');
  return { accountId, reservationId };
}

export async function holdAll(
  db: Database,
  request: { workspaceId: string; capability: string; at: Date; holds: readonly Hold[] },
): Promise<{ accountId: string; reservationIds: string[] }> {
  const { workspaceId, capability, at, holds } = request;
  if (holds.some(({ units }) => !Number.isSafeInteger(units) || units <= 0))
    throw new LedgerError('reservation_units_invalid');
  if (holds.some((one) => one.subject.workspaceId !== workspaceId))
    throw new LedgerError('reservation_workspace_mixed');
  const keyed = holds.map((one) => ({ ...one, key: holdKey(one) }));
  if (new Set(keyed.map((one) => one.key)).size !== keyed.length)
    throw new LedgerError('idempotency_key_reused');
  const accountId = await billingAccountId(db, workspaceId);
  if (!accountId) throw new LedgerError('account_not_found');
  if (!isNonEmpty(keyed)) return { accountId, reservationIds: [] };
  await capacityLock(db, accountId);
  // After the lock, so a project deleted under it is never reserved against.
  if (
    await missingSubject(
      db,
      keyed.map((one) => one.subject),
    )
  )
    throw new LedgerError('subject_not_found');
  const state = await accountState(db, workspaceId, accountId, at);
  const fingerprint = (one: KeyedHold) => holdFingerprint(accountId, capability, one);
  const priors = await priorHolds(db, accountId, keyed, fingerprint);
  const fresh = keyed.filter((one) => !priors.has(one.key));
  const ids = fresh.length
    ? await reserveFresh(db, { accountId, capability, at, state, fingerprint }, fresh)
    : new Map<string, string>();
  return {
    accountId,
    reservationIds: keyed.map((one) => priors.get(one.key)?.reservation_id ?? ids.get(one.key)!),
  };
}

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
    fingerprint: (one: KeyedHold) => string;
  },
  fresh: readonly KeyedHold[],
) {
  const ids = new Map<string, string>();
  const order = await lockedDrawOrder(db, { accountId, capability, state });
  const balances = await ledgerBalances(
    db,
    accountId,
    order.map((grant) => grant.id),
  );
  const rows = [];
  for (const one of fresh) {
    const { allocations, left } = allocate(order, balances, one.units);
    if (left) {
      logger.info('billing.consumable_credits_exhausted', {
        account_id: accountId,
        capability_key: capability,
        requested: one.units,
        shortfall: left,
      });
      throw new LedgerError('funded_credits_exhausted');
    }
    const reservationId = randomUUID();
    ids.set(one.key, reservationId);
    const context = { accountId, capability, at, reservationId, fingerprint: fingerprint(one) };
    for (const [index, allocation] of allocations.entries())
      rows.push(reservationRow(one, allocation, index, context));
  }
  for (const chunk of chunksOf(rows, CHUNK))
    await db.insertInto('consumable_ledger').values(chunk).execute(); // NOSONAR -- chunks share the transaction and its lock.
  return ids;
}

function grantRemaining(
  grant: { id: string; value: number },
  balances: ReadonlyMap<string, { reserved: number; consumed: number }>,
) {
  const balance = balances.get(grant.id) ?? { reserved: 0, consumed: 0 };
  return Math.max(0, grant.value - balance.reserved - balance.consumed);
}

export async function grantBalances(
  db: Database,
  accountId: string,
  grants: readonly { id: string; value: number }[],
) {
  const balances = await ledgerBalances(
    db,
    accountId,
    grants.map((grant) => grant.id),
  );
  return new Map(
    grants.map((grant) => {
      const { reserved, consumed } = balances.get(grant.id) ?? { reserved: 0, consumed: 0 };
      return [
        grant.id,
        { allowance: grant.value, reserved, consumed, remaining: grantRemaining(grant, balances) },
      ] as const;
    }),
  );
}

/**
 * Units of a consumable capability the account can hold now, and how many
 * selected grants fund it. It takes the capacity lock a hold takes, so a
 * hold sized from it in the same transaction draws against exactly this.
 */
export async function remaining(
  db: Database,
  request: { accountId: string; workspaceId: string; capability: string; at: Date },
): Promise<{ units: number; grants: number }> {
  const { accountId, workspaceId, capability, at } = request;
  await capacityLock(db, accountId);
  const state = await accountState(db, workspaceId, accountId, at);
  const order = await lockedDrawOrder(db, { accountId, capability, state });
  const balances = await ledgerBalances(
    db,
    accountId,
    order.map((grant) => grant.id),
  );
  return {
    units: order.reduce((sum, grant) => sum + grantRemaining(grant, balances), 0),
    grants: order.length,
  };
}

function holdFingerprint(accountId: string, capability: string, { subject, units }: KeyedHold) {
  return subject.kind === 'audit'
    ? auditFingerprint({
        account_id: accountId,
        capability_key: capability,
        subject_kind: 'audit',
        audit_id: subject.auditId,
        task_id: subject.id,
        units,
      })
    : digest({
        accountId,
        subject: { kind: subject.kind, id: subject.id, workspaceId: subject.workspaceId },
        units,
        capability,
      });
}

async function priorHolds(
  db: Database,
  accountId: string,
  holds: readonly KeyedHold[],
  fingerprint: (one: KeyedHold) => string,
) {
  const priors = new Map<string, Entry>();
  for (const keys of chunksOf(
    holds.map((one) => one.key),
    CHUNK,
  ))
    for (const row of await db // NOSONAR -- chunks share the transaction and its lock.
      .selectFrom('consumable_ledger')
      .selectAll()
      .where('billing_account_id', '=', accountId)
      .where('idempotency_key', 'in', keys)
      .execute())
      priors.set(row.idempotency_key, row);
  for (const one of holds) {
    const prior = priors.get(one.key);
    if (prior && prior.request_fingerprint !== fingerprint(one))
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

function reservationRow(
  { subject, key }: KeyedHold,
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

function subjectColumns(subject: Subject) {
  return {
    audit_id: subject.kind === 'audit' ? subject.auditId : null,
    task_id: subject.kind === 'audit' ? subject.id : null,
    agent_run_id: subject.kind === 'agent' ? subject.id : null,
    site_crawl_id: subject.kind === 'site_crawl' ? subject.id : null,
    platform_call_id: subject.kind === 'platform_call' ? subject.id : null,
  };
}

export const openReservedUnits = sql<number>`sum(case when entry_kind = 'reservation' then units when entry_kind = 'release' then -units else 0 end)`;

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
  const researchCalls = db
    .selectFrom('consumable_ledger')
    .select('reservation_id')
    .where('subject_kind', '=', 'platform_call')
    .where('subject_id', 'in', (eb) =>
      eb
        .selectFrom('search_intelligence_runs')
        .select('platform_call_id')
        .where('project_id', '=', projectId)
        .where('platform_call_id', 'is not', null),
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
            .union(researchCalls)
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

export async function ledgerBalances(db: Database, accountId: string, grantIds: readonly string[]) {
  const balances = new Map<string, { reserved: number; consumed: number }>();
  if (!grantIds.length) return balances;
  const rows = await db
    .selectFrom('consumable_ledger')
    .select(['grant_id', 'entry_kind', sql<string>`sum(units)`.as('units')])
    .where('billing_account_id', '=', accountId)
    .where('grant_id', 'in', [...new Set(grantIds)])
    .groupBy(['grant_id', 'entry_kind'])
    .execute();
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

export async function holdsOf(db: Database, subject: Subject, capability: string) {
  const rows = await db
    .selectFrom('consumable_ledger')
    .select('reservation_id')
    .distinct()
    .where('workspace_id', '=', subject.workspaceId)
    .where('subject_kind', '=', subject.kind)
    .where('subject_id', '=', subject.id)
    .where('capability_key', '=', capability)
    .where('entry_kind', '=', 'reservation')
    .orderBy('reservation_id')
    .execute();
  return rows.map((row) => row.reservation_id);
}

async function openReservation(db: Database, workspaceId: string, reservationId: string) {
  const owner = await db
    .selectFrom('consumable_ledger')
    .select('billing_account_id')
    .where('workspace_id', '=', workspaceId)
    .where('reservation_id', '=', reservationId)
    .where('entry_kind', '=', 'reservation')
    .executeTakeFirst();
  if (!owner) throw new LedgerError('reservation_not_found');
  await capacityLock(db, owner.billing_account_id);
  const rows = await db
    .selectFrom('consumable_ledger')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('billing_account_id', '=', owner.billing_account_id)
    .where('reservation_id', '=', reservationId)
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
  const open = holds.map((row) => ({
    row,
    units: Math.max(0, row.units - (released.get(row.grant_id) ?? 0)),
  }));
  return { rows, holds, open };
}

function entry(
  base: Entry,
  facts: {
    kind: 'release' | 'debit' | 'refund';
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

function releaseEntries(
  open: readonly { row: Entry; units: number }[],
  reservationId: string,
  at: Date,
) {
  return open
    .filter((share) => share.units > 0)
    .map(({ row, units }) =>
      entry(row, {
        kind: 'release',
        units,
        key: `${reservationId}:excess:${row.grant_id}`,
        at,
        fingerprint: digest({ reservationId, grantId: row.grant_id, units }),
        dispatch: 'release',
        attempt: null,
      }),
    );
}

export async function settle(
  db: Database,
  request: {
    workspaceId: string;
    reservationId: string;
    spent: number;
    attempt: number;
    dispatch: string;
    at: Date;
  },
): Promise<number> {
  const { workspaceId, reservationId, spent, attempt, dispatch, at } = request;
  if (!Number.isSafeInteger(spent) || spent < 0 || !Number.isSafeInteger(attempt) || attempt <= 0)
    throw new LedgerError('settle_units_invalid');
  const { rows, holds, open } = await openReservation(db, workspaceId, reservationId);
  const held = open.reduce((sum, share) => sum + share.units, 0);
  const units = Math.min(spent, held);
  const audit = holds[0].subject_kind === 'audit';
  const subjectId = holds[0].subject_id;
  const fingerprint = audit
    ? auditFingerprint({ reservation_id: reservationId, subject_id: subjectId, attempt, units })
    : digest({ reservationId, subjectId, attempt, dispatchKey: dispatch, units });
  const prior = rows.find(
    (row) =>
      row.entry_kind === 'debit' &&
      (audit ? row.attempt === attempt : row.dispatch_key === dispatch),
  );
  if (prior && units) {
    if (prior.request_fingerprint !== fingerprint) throw new LedgerError('idempotency_key_reused');
    return 0;
  }
  let left = units;
  const debits = open.map(({ row, units: free }) => {
    const take = Math.min(left, free);
    left -= take;
    return { row, take, rest: free - take };
  });
  const facts = { at, fingerprint, dispatch };
  const entries = debits.flatMap(({ row, take }) =>
    take
      ? [
          entry(row, {
            ...facts,
            kind: 'release',
            units: take,
            key: `${reservationId}:release:${row.grant_id}`,
            attempt: null,
          }),
          entry(row, {
            ...facts,
            kind: 'debit',
            units: take,
            key: `${reservationId}:debit:${row.grant_id}`,
            attempt,
          }),
        ]
      : [],
  );
  entries.push(
    ...releaseEntries(
      debits.map(({ row, rest }) => ({ row, units: rest })),
      reservationId,
      at,
    ),
  );
  if (entries.length) await db.insertInto('consumable_ledger').values(entries).execute();
  return units;
}

export async function release(
  db: Database,
  request: { workspaceId: string; reservationId: string; at: Date },
) {
  const { workspaceId, reservationId, at } = request;
  const { open } = await openReservation(db, workspaceId, reservationId);
  const entries = releaseEntries(open, reservationId, at);
  if (entries.length) await db.insertInto('consumable_ledger').values(entries).execute();
}

export async function refundSubject(db: Database, request: { subject: Subject; at: Date }) {
  const { subject, at } = request;
  const accountId = await billingAccountId(db, subject.workspaceId);
  if (!accountId) throw new LedgerError('account_not_found');
  await capacityLock(db, accountId);
  const debits = await db
    .selectFrom('consumable_ledger as debit')
    .selectAll('debit')
    .select((eb) =>
      eb
        .selectFrom('consumable_ledger as refund')
        .select(sql<string>`coalesce(sum(refund.units),0)`.as('refunded'))
        .where('refund.billing_account_id', '=', accountId)
        .whereRef('refund.refund_of_id', '=', 'debit.id')
        .where('refund.entry_kind', '=', 'refund')
        .as('refunded'),
    )
    .where('debit.workspace_id', '=', subject.workspaceId)
    .where('debit.billing_account_id', '=', accountId)
    .where('debit.subject_kind', '=', subject.kind)
    .where('debit.subject_id', '=', subject.id)
    .where('debit.entry_kind', '=', 'debit')
    .orderBy('debit.id')
    .execute();
  const entries = debits.flatMap(({ refunded, ...debit }) => {
    const units = debit.units - Number(refunded ?? 0);
    if (units <= 0) return [];
    return [
      {
        ...entry(debit, {
          kind: 'refund',
          units,
          key: `${debit.id}:refund`,
          at,
          fingerprint: digest({ debitId: debit.id, units }),
          dispatch: debit.dispatch_key,
          attempt: debit.attempt,
        }),
        refund_of_id: debit.id,
      },
    ];
  });
  if (entries.length) await db.insertInto('consumable_ledger').values(entries).execute();
}
