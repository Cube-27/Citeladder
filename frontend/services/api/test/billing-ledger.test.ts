import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  grantBalances,
  hold,
  refundSubject,
  release,
  remaining,
  settle,
  type AgentSubject,
  type Subject,
} from '../src/entitlements/ledger.ts';
import { issueBundle, revokeBundle } from '../src/entitlements/grants.ts';
import { asOwner, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { billingAccount } from './prompt-fixtures.ts';

const capability = 'site_health_page_fetches_per_period';

describe('consumable hold module', () => {
  const db = testDatabase();
  const fixtures = new VisibilityFixtures(db);
  const accounts: string[] = [];
  afterAll(async () => {
    if (accounts.length)
      await asOwner((owner) =>
        owner.deleteFrom('consumable_ledger').where('billing_account_id', 'in', accounts).execute(),
      );
    await fixtures.cleanup();
    await db.destroy();
  });
  async function tenant(units: number) {
    const t = await fixtures.tenant();
    const accountId = await billingAccount(db, t.workspaceId);
    accounts.push(accountId);
    const auditId = await fixtures.audit(t);
    const at = new Date();
    const grants = await db.transaction().execute((trx) =>
      issueBundle(trx, {
        workspaceId: t.workspaceId,
        accountId,
        key: randomUUID(),
        sourceKind: 'override',
        source: { kind: 'override', actorId: t.userId },
        reason: 'test override',
        specs: [{ key: capability, value: units }],
        revision: 'fixture',
        from: at,
        until: null,
        primary: false,
        profile: '',
        priority: 0,
      }),
    );
    const grant = { id: grants[0]!.id, value: units };
    const task = async (): Promise<Extract<Subject, { kind: 'audit' }>> => ({
      kind: 'audit',
      id: (await fixtures.execution(t, { auditId, analysis: null })).taskId,
      auditId,
      workspaceId: t.workspaceId,
    });
    const balance = async () => (await grantBalances(db, accountId, [grant])).get(grant.id);
    return { ...t, accountId, auditId, at, grant, task, balance };
  }
  const holdIn = (request: Parameters<typeof hold>[1]) =>
    db.transaction().execute((trx) => hold(trx, request));
  async function agentSubject(t: Awaited<ReturnType<typeof tenant>>): Promise<AgentSubject> {
    const chatId = randomUUID(),
      messageId = randomUUID(),
      runId = randomUUID();
    const scoped = { workspace_id: t.workspaceId, project_id: t.projectId, created_at: t.at };
    await db
      .insertInto('agent_chats')
      .values({
        ...scoped,
        id: chatId,
        action_id: null,
        archived_at: null,
        context_refs: '{}',
        created_by_user_id: t.userId,
        last_activity_at: t.at,
        pinned_skill_id: null,
        title: 'Ledger fixture',
        turn_count: 1,
        updated_at: t.at,
      })
      .execute();
    await db
      .insertInto('agent_messages')
      .values({
        ...scoped,
        id: messageId,
        chat_id: chatId,
        author_user_id: t.userId,
        content: 'Ledger fixture',
        evidence_refs: '[]',
        mentions: '[]',
        reply_to_message_id: null,
        role: 'user',
        sequence: 1,
        skill_id: null,
        skill_source: null,
        steps: '[]',
      })
      .execute();
    await db
      .insertInto('agent_runs')
      .values({
        ...scoped,
        id: runId,
        chat_id: chatId,
        user_message_id: messageId,
        user_id: t.userId,
        attempt_count: 0,
        available_at: t.at,
        budget: '{}',
        cancelled_at: null,
        completed_at: null,
        context_manifest: '{}',
        error_code: '',
        error_detail: '',
        funding_source: 'funded',
        heartbeat_at: null,
        idempotency_key: randomUUID(),
        lease_expires_at: null,
        lease_owner: null,
        max_attempts: 1,
        priority: 0,
        protocol_version: 'fixture',
        randomized_position: 0,
        registry_version: 'fixture',
        request_fingerprint: 'fixture',
        requested_model: 'fixture',
        requested_skill_id: null,
        requested_skill_source: null,
        runtime_version: 'fixture',
        skill_catalog_version: 'fixture',
        skill_id: null,
        skill_source: null,
        skill_version: null,
        status: 'queued',
        steps_used: 0,
        updated_at: t.at,
      })
      .execute();
    return { kind: 'agent', id: runId, workspaceId: t.workspaceId };
  }

  it('serializes account capacity, preserves subject provenance, and refuses foreign parents', async () => {
    const t = await tenant(3);
    const [first, second] = [await t.task(), await t.task()];
    const results = await Promise.allSettled(
      [first, second].map((subject) => holdIn({ capability, subject, units: 2, at: t.at })),
    );
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((row) => row.status === 'rejected')).toMatchObject({
      reason: { code: 'funded_credits_exhausted' },
    });
    const row = await db
      .selectFrom('consumable_ledger')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    const holder = row.task_id === first.id ? first : second;
    expect(row).toMatchObject({
      workspace_id: t.workspaceId,
      audit_id: t.auditId,
      grant_id: t.grant.id,
      idempotency_key: `run:${holder.id}`,
      units: 2,
    });
    expect(await holdIn({ capability, subject: holder, units: 2, at: t.at })).toEqual({
      accountId: t.accountId,
      reservationId: row.reservation_id,
    });
    await expect(holdIn({ capability, subject: holder, units: 1, at: t.at })).rejects.toThrow(
      'idempotency_key_reused',
    );
    const other = await tenant(4);
    await expect(
      holdIn({
        capability,
        subject: { ...holder, workspaceId: other.workspaceId },
        units: 1,
        at: t.at,
      }),
    ).rejects.toThrow('subject_not_found');
  });

  it('replays a hold recorded by the historical audit writer', async () => {
    const t = await tenant(3);
    const subject = await t.task();
    const { reservationId } = await holdIn({ capability, subject, units: 3, at: t.at });
    const historical = createHash('sha256')
      .update(
        `{"account_id":"${t.accountId}","audit_id":"${t.auditId}","capability_key":"${capability}","subject_kind":"audit","task_id":"${subject.id}","units":3}`,
      )
      .digest('hex');
    await asOwner((owner) =>
      owner
        .updateTable('consumable_ledger')
        .set({ request_fingerprint: historical })
        .where('reservation_id', '=', reservationId)
        .execute(),
    );
    expect((await holdIn({ capability, subject, units: 3, at: t.at })).reservationId).toBe(
      reservationId,
    );
  });

  it('settles at most what it holds, releases the rest, and settles once', async () => {
    const t = await tenant(10);
    const [spent, over] = [await t.task(), await t.task()];
    const a = await holdIn({ capability, subject: spent, units: 4, at: t.at });
    const b = await holdIn({ capability, subject: over, units: 2, at: t.at });
    const settleIn = (reservationId: string, units: number) =>
      db.transaction().execute((trx) =>
        settle(trx, {
          workspaceId: t.workspaceId,
          reservationId,
          spent: units,
          attempt: 1,
          dispatch: 'answer',
          at: new Date(),
        }),
      );
    expect(await t.balance()).toEqual({ allowance: 10, reserved: 6, consumed: 0, remaining: 4 });
    expect(await settleIn(a.reservationId, 1)).toBe(1);
    expect(await settleIn(b.reservationId, 5)).toBe(2);
    expect(await settleIn(a.reservationId, 1)).toBe(0);
    await db
      .transaction()
      .execute((trx) =>
        release(trx, { workspaceId: t.workspaceId, reservationId: b.reservationId, at: t.at }),
      );
    expect(await t.balance()).toEqual({ allowance: 10, reserved: 0, consumed: 3, remaining: 7 });
    expect(
      await db.transaction().execute((trx) =>
        remaining(trx, {
          accountId: t.accountId,
          workspaceId: t.workspaceId,
          capability,
          at: t.at,
        }),
      ),
    ).toEqual({ units: 7, grants: 1 });
  });

  it('consumes frozen holds after revocation and refunds each debit once', async () => {
    const t = await tenant(4);
    const subject = await agentSubject(t);
    const dispatches = ['dispatch-one', 'dispatch-two'];
    const holds = [];
    for (const dispatchId of dispatches)
      holds.push(await holdIn({ capability, subject, dispatchId, units: 2, at: t.at }));
    await db.transaction().execute((trx) =>
      revokeBundle(trx, {
        workspaceId: t.workspaceId,
        accountId: t.accountId,
        grantIds: [t.grant.id],
        key: randomUUID(),
        reason: 'fixture',
        actorKind: 'system',
        actorId: null,
        at: t.at,
      }),
    );
    for (const [index, { reservationId }] of holds.entries())
      await db.transaction().execute((trx) =>
        settle(trx, {
          workspaceId: t.workspaceId,
          reservationId,
          spent: index + 1,
          attempt: 1,
          dispatch: dispatches[index]!,
          at: new Date(),
        }),
      );
    expect(await t.balance()).toMatchObject({ reserved: 0, consumed: 3 });
    await Promise.all(
      [1, 2].map(() =>
        db.transaction().execute((trx) => refundSubject(trx, { subject, at: new Date() })),
      ),
    );
    expect(await t.balance()).toMatchObject({ reserved: 0, consumed: 0 });
    const refunds = await db
      .selectFrom('consumable_ledger')
      .select('units')
      .where('billing_account_id', '=', t.accountId)
      .where('entry_kind', '=', 'refund')
      .orderBy('units')
      .execute();
    expect(refunds).toEqual([{ units: 1 }, { units: 2 }]);
  });
});
