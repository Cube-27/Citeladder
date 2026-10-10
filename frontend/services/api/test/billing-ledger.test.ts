import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  reserveUsage,
  debitUsage,
  releaseUsage,
  refundUsage,
  ledgerBalances,
  type Subject,
} from '../src/entitlements/ledger.ts';
import { issueBundle, revokeBundle } from '../src/entitlements/grants.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { billingAccount } from './prompt-fixtures.ts';

describe('shared consumable ledger', () => {
  const db = testDatabase();
  const fixtures = new VisibilityFixtures(db);
  const accounts: string[] = [];
  afterAll(async () => {
    if (accounts.length)
      await db
        .deleteFrom('consumable_ledger')
        .where('billing_account_id', 'in', accounts)
        .execute();
    await fixtures.cleanup();
    await db.destroy();
  });
  async function tenant(units: number, capability = 'audit_credits') {
    const t = await fixtures.tenant();
    const accountId = await billingAccount(db, t.workspaceId);
    accounts.push(accountId);
    const auditId = await fixtures.audit(t);
    const task = await fixtures.execution(t, { auditId, analysis: null });
    const at = new Date();
    const grants = await db.transaction().execute((trx) =>
      issueBundle(trx, {
        workspaceId: t.workspaceId,
        accountId,
        key: randomUUID(),
        sourceKind: 'override',
        sourceRef: 'fixture',
        specs: [{ key: capability, value: units }],
        revision: 'fixture',
        from: at,
        until: null,
        primary: false,
        profile: '',
        priority: 0,
      }),
    );
    const subject: Subject = {
      kind: 'audit',
      id: task.taskId,
      auditId,
      workspaceId: t.workspaceId,
    };
    return { ...t, accountId, subject, at, grantId: grants[0]!.id };
  }
  async function agentSubject(t: Awaited<ReturnType<typeof tenant>>): Promise<Subject> {
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
        connection_id: null,
        context_manifest: '{}',
        credential_revision: null,
        error_code: '',
        error_detail: '',
        funding_source: 'funded',
        heartbeat_at: null,
        idempotency_key: randomUUID(),
        lease_expires_at: null,
        lease_owner: null,
        max_attempts: 1,
        mode: 'read',
        priority: 0,
        protocol_version: 'fixture',
        randomized_position: 0,
        registry_version: 'fixture',
        request_fingerprint: 'fixture',
        requested_model: 'fixture',
        requested_skill_id: null,
        requested_skill_source: null,
        route_id: null,
        route_revision: null,
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
  it('debits distinct dispatches in one Agent run while suppressing each dispatch replay', async () => {
    const t = await tenant(4, 'ai_credits');
    const subject = await agentSubject(t);
    const reservationId = await db.transaction().execute((trx) =>
      reserveUsage(trx, {
        accountId: t.accountId,
        subject,
        capability: 'ai_credits',
        units: 4,
        key: randomUUID(),
        at: t.at,
      }),
    );
    const first = {
      workspaceId: t.workspaceId,
      accountId: t.accountId,
      reservationId,
      subjectId: subject.id,
      attempt: 1,
      units: 1,
      key: 'model-step-one',
      dispatchKey: 'model-step-one',
      at: t.at,
    };
    await db.transaction().execute((trx) => debitUsage(trx, first));
    await db
      .transaction()
      .execute((trx) =>
        debitUsage(trx, { ...first, key: 'model-step-two', dispatchKey: 'model-step-two' }),
      );
    await db
      .transaction()
      .execute((trx) => debitUsage(trx, { ...first, key: 'same-dispatch-retry' }));
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 2,
      reserved: 2,
    });
    await expect(
      db
        .transaction()
        .execute((trx) => debitUsage(trx, { ...first, dispatchKey: 'changed-dispatch' })),
    ).rejects.toThrow('idempotency_key_reused');
  });
  it('serializes account capacity, preserves subject provenance, and refuses foreign parents', async () => {
    const t = await tenant(3);
    const reserve = (key: string, units = 2) =>
      db.transaction().execute((trx) =>
        reserveUsage(trx, {
          accountId: t.accountId,
          subject: t.subject,
          capability: 'audit_credits',
          units,
          key,
          at: t.at,
        }),
      );
    const results = await Promise.allSettled([reserve('reserve-alpha'), reserve('reserve-beta')]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((row) => row.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { message: 'funded_credits_exhausted' },
    });
    const hold = await db
      .selectFrom('consumable_ledger')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    expect(hold).toMatchObject({
      workspace_id: t.workspaceId,
      task_id: t.subject.id,
      audit_id: t.subject.kind === 'audit' ? t.subject.auditId : null,
      grant_id: t.grantId,
    });
    expect(await reserve(hold.idempotency_key)).toBe(hold.reservation_id);
    await expect(reserve(hold.idempotency_key, 1)).rejects.toThrow('idempotency_key_reused');
    const other = await tenant(4);
    await expect(
      db.transaction().execute((trx) =>
        reserveUsage(trx, {
          accountId: other.accountId,
          subject: { ...t.subject, workspaceId: other.workspaceId },
          capability: 'audit_credits',
          units: 1,
          key: randomUUID(),
          at: t.at,
        }),
      ),
    ).rejects.toThrow('subject_not_found');
  });
  it('replays reservations and settled attempts recorded by an earlier audit run', async () => {
    const t = await tenant(3);
    if (t.subject.kind !== 'audit') throw new Error('Expected audit subject');
    const key = randomUUID();
    const request = {
      accountId: t.accountId,
      subject: t.subject,
      capability: 'audit_credits',
      units: 3,
      key,
      at: t.at,
    };
    const reservationId = await db.transaction().execute((trx) => reserveUsage(trx, request));
    // The historical writer serializes these keys in this exact order.
    const hash = (json: string) => createHash('sha256').update(json).digest('hex');
    const reservationFingerprint = hash(
      `{"account_id":"${t.accountId}","audit_id":"${t.subject.auditId}","capability_key":"audit_credits","subject_kind":"audit","task_id":"${t.subject.id}","units":3}`,
    );
    await db
      .updateTable('consumable_ledger')
      .set({ request_fingerprint: reservationFingerprint })
      .where('reservation_id', '=', reservationId)
      .execute();
    expect(await db.transaction().execute((trx) => reserveUsage(trx, request))).toBe(reservationId);
    const debit = {
      workspaceId: t.workspaceId,
      accountId: t.accountId,
      reservationId,
      subjectId: t.subject.id,
      attempt: 1,
      units: 1,
      key: 'historical-attempt',
      dispatchKey: '1',
      at: t.at,
    };
    await db.transaction().execute((trx) => debitUsage(trx, debit));
    const settlementFingerprint = hash(
      `{"attempt":1,"reservation_id":"${reservationId}","subject_id":"${t.subject.id}","units":1}`,
    );
    await db
      .updateTable('consumable_ledger')
      .set({ request_fingerprint: settlementFingerprint })
      .where('reservation_id', '=', reservationId)
      .where('entry_kind', '=', 'debit')
      .execute();
    await db
      .transaction()
      .execute((trx) =>
        debitUsage(trx, { ...debit, key: 'new-worker-replay', dispatchKey: 'attempt-1' }),
      );
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 1,
      reserved: 2,
    });
    await expect(
      db.transaction().execute((trx) => debitUsage(trx, { ...debit, units: 2 })),
    ).rejects.toThrow('idempotency_key_reused');
  });
  it('consumes frozen holds after revocation, releases once, and caps immutable refunds', async () => {
    const t = await tenant(4);
    const reservationId = await db.transaction().execute((trx) =>
      reserveUsage(trx, {
        accountId: t.accountId,
        subject: t.subject,
        capability: 'audit_credits',
        units: 3,
        key: randomUUID(),
        at: t.at,
      }),
    );
    await db.transaction().execute((trx) =>
      revokeBundle(trx, {
        workspaceId: t.workspaceId,
        accountId: t.accountId,
        grantIds: [t.grantId],
        key: randomUUID(),
        reason: 'fixture',
        actorKind: 'system',
        actorId: null,
        at: t.at,
      }),
    );
    const debit = {
      workspaceId: t.workspaceId,
      accountId: t.accountId,
      reservationId,
      subjectId: t.subject.id,
      attempt: 1,
      units: 2,
      key: 'attempt-one',
      dispatchKey: 'attempt-one',
      at: new Date(),
    };
    await Promise.all([1, 2].map(() => db.transaction().execute((trx) => debitUsage(trx, debit))));
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 2,
      reserved: 1,
    });
    await Promise.all(
      [1, 2].map(() =>
        db.transaction().execute((trx) => releaseUsage(trx, { ...debit, key: 'terminal' })),
      ),
    );
    const row = await db
      .selectFrom('consumable_ledger')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .where('entry_kind', '=', 'debit')
      .executeTakeFirstOrThrow();
    const refund = {
      workspaceId: t.workspaceId,
      accountId: t.accountId,
      debitId: row.id,
      units: 1,
      key: 'refund-one',
      at: new Date(),
    };
    await Promise.all(
      [1, 2].map(() => db.transaction().execute((trx) => refundUsage(trx, refund))),
    );
    expect((await ledgerBalances(db, t.accountId)).get(t.grantId)).toEqual({
      consumed: 1,
      reserved: 0,
    });
    await expect(
      db.transaction().execute((trx) => refundUsage(trx, { ...refund, key: 'excess', units: 2 })),
    ).rejects.toThrow('refund_exceeds_debit');
    await expect(
      db
        .transaction()
        .execute((trx) => debitUsage(trx, { ...debit, key: 'attempt-two', attempt: 2, units: 1 })),
    ).rejects.toThrow('reservation_exhausted');
  });
});
