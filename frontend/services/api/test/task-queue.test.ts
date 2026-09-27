/**
 * The analytics queue against real PostgreSQL: claims by disjoint kind sets
 * never overlap, a workspace gets one task before any gets a second, and only
 * the lease owner may run or extend a claimed row.
 */
import { randomUUID } from 'node:crypto';

import type { AliasNode, OperationNode, SelectQueryNode } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { policy } from '../src/config.ts';
import { claimStatement, TaskQueue } from '../src/queue/task-queue.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase();
const fixtures = new Fixtures(db);
const queue = new TaskQueue(db, { leaseTtlSeconds: 120 });
const TS_KINDS = policy.analytics.ts_owned_task_kinds;
const PYTHON_KINDS = policy.analytics.python_task_kinds;
let workspaces: string[] = [];

async function task(workspaceId: string, kind: string, priority = 0): Promise<string> {
  const id = randomUUID();
  const now = new Date(Date.now() - 1000);
  await db
    .insertInto('analytics_tasks')
    .values({
      id,
      workspace_id: workspaceId,
      task_kind: kind,
      payload: {},
      idempotency_key: `queue-test:${id}`,
      status: 'queued',
      priority,
      randomized_position: 0,
      available_at: now,
      attempt_count: 0,
      max_attempts: 3,
      error_code: '',
      error_detail: '',
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
}

beforeAll(async () => {
  const owner = await fixtures.user();
  workspaces = [
    await fixtures.ownedWorkspace(owner),
    await fixtures.ownedWorkspace(owner),
    await fixtures.ownedWorkspace(owner),
  ];
});

beforeEach(async () => {
  await db.deleteFrom('analytics_tasks').where('workspace_id', 'in', workspaces).execute();
});

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

/** Column names referenced by a node, not descending into subqueries. */
function referencedColumns(node: unknown, into = new Set<string>()): Set<string> {
  if (node === null || typeof node !== 'object') return into;
  const operation = node as OperationNode & Record<string, unknown>;
  if (operation.kind === 'SelectQueryNode') return into;
  if (operation.kind === 'ColumnNode') {
    into.add((operation.column as { name: string }).name);
  }
  for (const child of Object.values(operation)) {
    if (Array.isArray(child)) child.forEach((item) => referencedColumns(item, into));
    else referencedColumns(child, into);
  }
  return into;
}

describe('TaskQueue', () => {
  it('re-checks eligibility on the locked relation, not only in the ranking', () => {
    const node = claimStatement(db, {
      now: new Date(),
      limit: 1,
      kinds: TS_KINDS,
    }).toOperationNode();
    expect(referencedColumns(node.where)).toEqual(new Set(['status', 'available_at']));
    const ranked = (node.joins![0]!.table as AliasNode).node as SelectQueryNode;
    expect(referencedColumns(ranked.where)).toEqual(
      new Set(['status', 'available_at', 'task_kind']),
    );
    expect(node.endModifiers?.map((item) => item.modifier)).toEqual(['ForUpdate', 'SkipLocked']);
  });

  it('never cross-claims between workers with disjoint kind sets', async () => {
    const created = new Map<string, string>();
    for (const [index, workspaceId] of workspaces.entries()) {
      for (let copy = 0; copy < 6; copy += 1) {
        for (const kind of [...TS_KINDS, ...PYTHON_KINDS]) {
          created.set(await task(workspaceId, kind, (index + copy) % 3), kind);
        }
      }
    }
    const drain = async (owner: string, kinds: readonly string[]) => {
      const seen: { id: string; kind: string }[] = [];
      for (;;) {
        const claimed = await queue.claim({ owner, kinds, limit: 3 });
        if (claimed.length === 0) return seen;
        seen.push(...claimed.map((row) => ({ id: row.id, kind: row.task_kind })));
      }
    };
    const results = await Promise.all([
      ...[1, 2, 3, 4].map((n) => drain(`ts-${n}`, TS_KINDS)),
      ...[1, 2, 3, 4].map((n) => drain(`py-${n}`, PYTHON_KINDS)),
    ]);
    const tsClaims = results.slice(0, 4).flat();
    const pythonClaims = results.slice(4).flat();
    const all = [...tsClaims, ...pythonClaims].map((claim) => claim.id);

    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(created.keys()));
    expect(tsClaims.every((claim) => TS_KINDS.includes(claim.kind))).toBe(true);
    expect(pythonClaims.every((claim) => PYTHON_KINDS.includes(claim.kind))).toBe(true);
  });

  it('serves one task per workspace before any workspace gets a second', async () => {
    const [busy, quiet] = workspaces as [string, string];
    for (let index = 0; index < 4; index += 1) await task(busy, 'ingest_referrals', 5);
    await task(quiet, 'ingest_referrals', 0);

    const claimed = await queue.claim({ owner: 'fair', kinds: TS_KINDS, limit: 2 });

    expect(claimed.map((row) => row.workspace_id).sort()).toEqual([busy, quiet].sort());
    expect(claimed.every((row) => row.status === 'leased' && row.lease_owner === 'fair')).toBe(
      true,
    );
  });

  it('lets only the lease owner run and extend a claimed row', async () => {
    await task(workspaces[0]!, 'classify_referrals');
    const [claimed] = await queue.claim({ owner: 'holder', kinds: TS_KINDS });

    expect(await queue.markRunning(claimed!.id, 'intruder')).toBe(false);
    expect(await queue.heartbeat(claimed!.id, 'intruder')).toBe(false);
    expect(await queue.markRunning(claimed!.id, 'holder')).toBe(true);
    expect(await queue.markRunning(claimed!.id, 'holder')).toBe(false);
    expect(await queue.heartbeat(claimed!.id, 'holder')).toBe(true);
  });

  it('skips rows that are not yet available or already terminal', async () => {
    const future = await task(workspaces[0]!, 'ingest_referrals');
    await db
      .updateTable('analytics_tasks')
      .set({ available_at: new Date(Date.now() + 60_000) })
      .where('id', '=', future)
      .execute();
    const done = await task(workspaces[1]!, 'ingest_referrals');
    await db
      .updateTable('analytics_tasks')
      .set({ status: 'succeeded' })
      .where('id', '=', done)
      .execute();

    expect(await queue.claim({ owner: 'late', kinds: TS_KINDS })).toEqual([]);
  });
});
