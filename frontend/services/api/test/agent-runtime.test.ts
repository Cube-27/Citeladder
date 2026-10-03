import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { testDatabase } from './support.ts';
import {
  AgentFixtures,
  catalog,
  deliverable,
  emptyPackage,
  reply,
  result,
  scripted,
  zeroFunding,
  agentPolicy,
} from './agent-support.ts';
import { AgentError, parseStep } from '../src/agent/contracts.ts';
import { AgentQueue, lockRun } from '../src/agent/queue.ts';
import { AgentOutputs } from '../src/agent/outputs.ts';
import { ModelCalls, type Funding } from '../src/agent/model-calls.ts';
import { readChat, listChats, listRevisions, progress } from '../src/agent/reads.ts';
import { ToolRegistry } from '../src/agent/tools.ts';
import { contextCitations, renderManifest } from '../src/agent/context.ts';
import { bounded, stripUnverifiedRefs } from '../src/agent/runtime.ts';
import { fingerprint } from '../src/agent/store.ts';
import { runAgentOnce } from '../src/agent/worker.ts';

describe('inactive Agent runtime foundation on PostgreSQL', () => {
  const db = testDatabase();
  const fixtures = new AgentFixtures(db);
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });

  it('serializes same-key races and refuses a changed full request or a second active turn', async () => {
    const scope = await fixtures.scope();
    const store = fixtures.store();
    const request = { key: randomUUID(), message: 'Help with a plan', skillId: 'plan' };
    const [a, b] = await Promise.all([
      store.enqueue(scope, request),
      store.enqueue(scope, request),
    ]);
    expect(a.id).toBe(b.id);
    const detail = await readChat(db, scope, a.chat_id);
    expect(detail.messages.map((message) => message.role)).toEqual(['user']);
    await expect(
      store.enqueue(scope, { ...request, message: 'Changed request' }),
    ).rejects.toMatchObject({ code: 'agent_idempotency_conflict' });
    await expect(
      store.enqueue(scope, { key: randomUUID(), message: 'Another turn', chatId: a.chat_id }),
    ).rejects.toMatchObject({ code: 'agent_run_active' });
    expect(fingerprint({ b: 2, a: { z: 1, y: 2 } })).toBe(fingerprint({ a: { y: 2, z: 1 }, b: 2 }));
  });
  it('rolls back chat and message when funding/context admission refuses; authorizes every Action', async () => {
    const scope = await fixtures.scope();
    const other = await fixtures.scope();
    await expect(
      fixtures
        .store({
          admission: async () => {
            throw new AgentError('funding_unavailable');
          },
        })
        .enqueue(scope, { key: randomUUID(), message: 'Request' }),
    ).rejects.toMatchObject({ code: 'funding_unavailable' });
    await expect(
      fixtures
        .store()
        .enqueue(scope, { key: randomUUID(), message: 'Request', mentionIds: [randomUUID()] }),
    ).rejects.toMatchObject({ code: 'agent_context_unavailable' });
    expect(await listChats(db, scope)).toMatchObject({ items: [] });
    const run = await fixtures
      .store()
      .enqueue(other, { key: randomUUID(), message: 'Other workspace' });
    await expect(readChat(db, scope, run.chat_id)).rejects.toMatchObject({ status: 404 });
    await expect(
      fixtures
        .store()
        .enqueue(
          { ...scope, projectId: other.projectId },
          { key: randomUUID(), message: 'Foreign project' },
        ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('refuses an idempotency replay across projects in the same workspace', async () => {
    const scope = await fixtures.scope();
    const projectId = await fixtures.project(scope.workspaceId);
    const store = fixtures.store();
    const initial = await store.enqueue(scope, { key: randomUUID(), message: 'Question' });
    await store.cancel(scope, initial.chat_id, initial.id);
    const request = { key: randomUUID(), message: 'Follow up', chatId: initial.chat_id };
    const run = await store.enqueue(scope, request);
    await expect(store.enqueue({ ...scope, projectId }, request)).rejects.toMatchObject({
      status: 404,
    });
    expect((await store.enqueue(scope, request)).id).toBe(run.id);
  });
  it('claims once under contention, never revives expiry, and fences previous attempts after recovery', async () => {
    const scope = await fixtures.scope();
    const queued = await fixtures
      .store()
      .enqueue(scope, { key: randomUUID(), message: 'Question' });
    const queue = new AgentQueue(db, 30);
    const claims = await Promise.all(
      ['a', 'b'].map((owner) => queue.claim(owner, [scope.workspaceId])),
    );
    const claimed = claims.find((run) => run !== null)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    const lease = await queue.start(claimed, claimed.lease_owner!);
    expect(await queue.heartbeat(lease)).toBe(true);
    await db
      .updateTable('agent_runs')
      .set({ lease_expires_at: new Date(0) })
      .where('id', '=', queued.id)
      .execute();
    expect(await queue.heartbeat(lease)).toBe(false);
    await expect(db.transaction().execute((trx) => lockRun(trx, lease))).rejects.toMatchObject({
      code: 'lease',
    });
    const calls = new ModelCalls(db, zeroFunding);
    expect(
      await queue.recover([scope.workspaceId], 1, (trx, run) => calls.reconcile(trx, run)),
    ).toBe(1);
    const next = await queue.claim(lease.owner, [scope.workspaceId]);
    const current = await queue.start(next!, lease.owner);
    expect(current.attempt).toBe(2);
    await expect(db.transaction().execute((trx) => lockRun(trx, lease))).rejects.toMatchObject({
      code: 'lease',
    });
    await fixtures.runtime(scope, scripted([reply()])).execute(current);
    expect((await fixtures.run(queued.id)).status).toBe('succeeded');
  });
  it('exhausts repeatedly recovered claims that never reached start', async () => {
    const scope = await fixtures.scope();
    const queued = await fixtures
      .store()
      .enqueue(scope, { key: randomUUID(), message: 'Question' });
    await db
      .updateTable('agent_runs')
      .set({ max_attempts: 2 })
      .where('id', '=', queued.id)
      .execute();
    const queue = new AgentQueue(db, 30);
    const calls = new ModelCalls(db, zeroFunding);
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await queue.claim('crashed', [scope.workspaceId])).not.toBeNull();
      await db
        .updateTable('agent_runs')
        .set({ lease_expires_at: new Date(0) })
        .where('id', '=', queued.id)
        .execute();
      expect(
        await queue.recover([scope.workspaceId], 1, (trx, run) => calls.reconcile(trx, run)),
      ).toBe(1);
    }
    expect(await fixtures.run(queued.id)).toMatchObject({
      status: 'failed',
      attempt_count: 2,
      error_code: 'max_attempts_exceeded',
    });
    expect(await queue.claim('next', [scope.workspaceId])).toBeNull();
  });
  it('contains start failure without dispatching the runtime', async () => {
    const scope = await fixtures.scope();
    await fixtures.store().enqueue(scope, { key: randomUUID(), message: 'Question' });
    const queue = new AgentQueue(db, 30);
    const runtime = fixtures.runtime(scope, scripted([reply()]));
    const start = vi.spyOn(queue, 'start').mockRejectedValueOnce(new AgentError('lease'));
    const execute = vi.spyOn(runtime, 'execute');
    try {
      expect(await runAgentOnce(queue, runtime, 'lost', [scope.workspaceId], () => 0)).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      start.mockRestore();
      execute.mockRestore();
    }
  });
  it('commits dispatch before model I/O, exposes progress, binds evidence and appends a reply atomically', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope);
    const uri = `citeladder://project/${scope.projectId}`;
    const fake = scripted(
      [
        { action: 'select_skill', skill_id: 'plan' },
        { action: 'call_tool', tool: 'read_evidence', arguments: {} },
        {
          action: 'respond',
          reply: `Read ${uri}; invented citeladder://project/${randomUUID()}.`,
          evidence: [uri, 'invented'],
          output: { title: 'Plan', body: 'Use the supplied evidence.', phase: 'final' },
        },
      ],
      async (_request, ordinal) => {
        const committed = await db
          .selectFrom('agent_model_attempts')
          .selectAll()
          .where('run_id', '=', run.id)
          .where('ordinal', '=', ordinal)
          .executeTakeFirstOrThrow();
        expect(committed.outcome).toBe('dispatched');
        expect((await progress(db, await fixtures.run(run.id))).at(-1)).toMatchObject({
          status: 'working',
          ordinal,
        });
      },
    );
    await fixtures.runtime(scope, fake).execute(lease);
    const detail = await readChat(db, scope, run.chat_id);
    expect(detail.latest_run).toMatchObject({
      status: 'succeeded',
      steps_used: 3,
      skill_id: 'plan',
      progress: [],
    });
    expect(detail.messages.at(-1)).toMatchObject({ role: 'agent', evidence_refs: [uri] });
    expect(detail.messages.at(-1)?.content).toContain('[unverified reference]');
    expect(detail.output?.latest_revision).toMatchObject({ number: 1, source_refs: [uri] });
    const attempts = await db
      .selectFrom('agent_model_attempts')
      .selectAll()
      .where('run_id', '=', run.id)
      .execute();
    expect(attempts.map((attempt) => attempt.settlement_status)).toEqual([
      'zero_debit',
      'zero_debit',
      'zero_debit',
    ]);
    expect(
      attempts.every(
        (attempt) => attempt.request_hash.length === 64 && attempt.output_hash.length === 64,
      ),
    ).toBe(true);
  });
  it('settles a model cancelled in flight exactly once and writes no late reply', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope);
    const settle = vi.fn(zeroFunding.settle);
    const models = new ModelCalls(db, { ...zeroFunding, settle });
    const fake = scripted([reply()], async () => {
      await fixtures.store().cancel(scope, run.chat_id, run.id);
    });
    await fixtures.runtime(scope, fake, { models }).execute(lease);
    const attempt = await db
      .selectFrom('agent_model_attempts')
      .selectAll()
      .where('run_id', '=', run.id)
      .executeTakeFirstOrThrow();
    await models.receipt(scope.workspaceId, attempt.id, result(reply('Duplicate receipt')));
    expect(settle).toHaveBeenCalledTimes(1);
    expect((await readChat(db, scope, run.chat_id)).messages).toHaveLength(1);
    expect((await fixtures.run(run.id)).status).toBe('cancelled');
  });
  it('reconciles lost dispatch as unknown before retry and bounds the final expired attempt', async () => {
    const scope = await fixtures.scope();
    const { run, lease, queue } = await fixtures.claimed(scope);
    const settle = vi.fn(async () => ({ credits: 0, status: 'zero_debit' }));
    const models = new ModelCalls(db, { ...zeroFunding, settle });
    const attempt = await models.dispatch(lease, 1, scripted([]), {
      system: 'test',
      user: 'test',
      schema: {},
    });
    await queue.retry(lease, 0, (trx, row) => models.reconcile(trx, row));
    await models.receipt(scope.workspaceId, attempt.id, result(reply()));
    expect(settle).toHaveBeenCalledTimes(1);
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('outcome')
        .where('id', '=', attempt.id)
        .executeTakeFirst(),
    ).toMatchObject({ outcome: 'recovered_unknown' });
    const next = await queue.claim('another', [scope.workspaceId]);
    await queue.start(next!, 'another');
    await db
      .updateTable('agent_runs')
      .set({ attempt_count: agentPolicy.run_max_attempts, lease_expires_at: new Date(0) })
      .where('id', '=', run.id)
      .execute();
    await queue.recover([scope.workspaceId], 1, (trx, row) => models.reconcile(trx, row));
    expect((await fixtures.run(run.id)).status).toBe('failed');
    expect(await queue.claim('again', [scope.workspaceId])).toBeNull();
  });
  it('stops before dispatch for changed catalogs and removed members, with no model call', async () => {
    const scope = await fixtures.scope();
    const first = await fixtures.claimed(scope);
    const complete = vi.fn(scripted([]).complete);
    await fixtures
      .runtime(
        scope,
        { ...scripted([]), complete },
        { catalog: { ...catalog, version: 'changed' } },
      )
      .execute(first.lease);
    expect((await fixtures.run(first.run.id)).error_code).toBe('skills_changed');
    const second = await fixtures.claimed(scope);
    await db
      .updateTable('workspace_members')
      .set({ role: 'viewer' })
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
    await fixtures.runtime(scope, { ...scripted([]), complete }).execute(second.lease);
    expect((await fixtures.run(second.run.id)).error_code).toBe('access_revoked');
    expect(complete).not.toHaveBeenCalled();
  });
  it('enforces outline approval and refuses editing during the admitted draft', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope, { skillId: 'content' });
    await fixtures.runtime(scope, scripted([deliverable()])).execute(lease);
    const outputs = new AgentOutputs(db);
    let detail = await readChat(db, scope, run.chat_id);
    const original = detail.output!.latest_revision!;
    expect(original.phase).toBe('outline');
    await expect(
      fixtures.store().enqueue(scope, {
        chatId: run.chat_id,
        key: randomUUID(),
        message: 'Change kind',
        skillId: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'agent_skill_kind_conflict' });
    const draft = await fixtures
      .store()
      .approveOutline(scope, run.chat_id, original.id, randomUUID());
    const queue = new AgentQueue(db, 30);
    const owned = await queue.claim('draft', [scope.workspaceId]);
    const next = await queue.start(owned!, 'draft');
    await expect(
      outputs.edit(scope, run.chat_id, original.id, 'Busy', 'Busy'),
    ).rejects.toMatchObject({ code: 'agent_run_active' });
    await fixtures
      .runtime(
        scope,
        scripted([deliverable('draft', 'Draft after approval')], async (request) => {
          expect(request.user).toContain(original.body);
        }),
      )
      .execute(next);
    detail = await readChat(db, scope, run.chat_id);
    expect(detail.output!.latest_revision).toMatchObject({
      phase: 'draft',
      number: 2,
      parent_revision_id: original.id,
    });
    expect((await fixtures.run(draft.id)).status).toBe('succeeded');
  });
  it('appends user edits and restores while refusing stale bases', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope, { skillId: 'plan' });
    await fixtures.runtime(scope, scripted([deliverable('final')])).execute(lease);
    const outputs = new AgentOutputs(db);
    const original = (await readChat(db, scope, run.chat_id)).output!.latest_revision!;
    const edited = await outputs.edit(scope, run.chat_id, original.id, 'Edited', 'User document');
    await expect(
      outputs.edit(scope, run.chat_id, original.id, 'Stale', 'Stale edit'),
    ).rejects.toMatchObject({ code: 'output_conflict' });
    const restored = await outputs.restore(scope, run.chat_id, original.id);
    expect(restored).toMatchObject({
      number: 3,
      parent_revision_id: edited.id,
      body: original.body,
    });
    expect(
      (await listRevisions(db, scope, run.chat_id)).items.map((revision) => revision.number),
    ).toEqual([3, 2, 1]);
  });
  it('follows the user edit as the base of a later Agent revision', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope, { skillId: 'plan' });
    await fixtures.runtime(scope, scripted([deliverable('draft')])).execute(lease);
    const outputs = new AgentOutputs(db);
    const latest = (await readChat(db, scope, run.chat_id)).output!.latest_revision!;
    const userEdit = await outputs.edit(
      scope,
      run.chat_id,
      latest.id,
      'My draft',
      'User edited draft',
    );
    const followup = await fixtures.claimed(scope, {
      chatId: run.chat_id,
      message: 'Refine the current draft',
    });
    await fixtures
      .runtime(
        scope,
        scripted([deliverable('final', 'Refined')], async (request) => {
          expect(request.user).toContain('User edited draft');
        }),
      )
      .execute(followup.lease);
    expect(
      (await readChat(db, scope, run.chat_id)).output!.latest_revision!.parent_revision_id,
    ).toBe(userEdit.id);
  });
  it('rolls back reply/output together when the base revision or target attachment changes', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope, { skillId: 'plan' });
    await fixtures
      .runtime(scope, scripted([deliverable('final')]), {
        attachTarget: async () => {
          throw new AgentError('output_conflict');
        },
      })
      .execute(lease);
    const detail = await readChat(db, scope, run.chat_id);
    expect(detail.messages).toHaveLength(1);
    expect(detail.output).toBeNull();
    expect(detail.latest_run?.error_code).toBe('output_conflict');
  });
  it('refuses project selection, unknown tools and a read on the final step, without a partial deliverable', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope);
    await db
      .updateTable('agent_runs')
      .set({ budget: { max_steps: 3, max_tool_calls: 2, execution_timeout_seconds: 10 } })
      .where('id', '=', run.id)
      .execute();
    await fixtures
      .runtime(
        scope,
        scripted([
          { action: 'call_tool', tool: 'read_evidence', arguments: { project_id: randomUUID() } },
          { action: 'call_tool', tool: 'unknown_tool', arguments: {} },
          { action: 'call_tool', tool: 'read_evidence', arguments: {} },
        ]),
      )
      .execute(lease);
    const attempts = await db
      .selectFrom('agent_tool_attempts')
      .select(['status', 'error_code'])
      .where('run_id', '=', run.id)
      .orderBy('ordinal')
      .execute();
    expect(attempts.map((attempt) => attempt.status)).toEqual(['refused', 'refused', 'refused']);
    expect(attempts.at(-1)?.error_code).toBe('last_step_must_respond');
    const detail = await readChat(db, scope, run.chat_id);
    expect(detail.latest_run?.error_code).toBe('stopped_at_limit');
    expect(detail.output).toBeNull();
  });
  it('bounds unavailable tool results with explicit omissions and filters fabricated citations', async () => {
    const scope = await fixtures.scope();
    const tools = new ToolRegistry('test-tools-1', [
      {
        name: 'missing',
        description: 'Read missing evidence.',
        arguments: z.object({}).strict(),
        read: async () => ({
          state: 'unavailable',
          data: 'x'.repeat(agentPolicy.tool_result_max_chars + 1),
          artifactRefs: [],
          omissions: [{ reason: 'missing_snapshot', count: 1 }],
        }),
      },
    ]);
    const outcome = await tools.execute(db, scope, 'missing', {}, AbortSignal.timeout(1000));
    expect(outcome.status).toBe('unavailable');
    expect(outcome.omissions).toContainEqual({ reason: 'tool_result_truncated', count: 1 });
    expect(outcome.text).toContain('[tool result truncated]');
    expect(stripUnverifiedRefs('See citeladder://project/foreign.', new Set())).toBe(
      'See [unverified reference].',
    );
    const id = randomUUID();
    const manifest = {
      version: 'agent-context-1',
      refs: {},
      package: emptyPackage,
      instructions: null,
      action: null,
      mentions: [
        {
          id: randomUUID(),
          target_label: 'A',
          skill_id: 'plan',
          diagnosis: { what_happened: [{ opportunity_id: id }] },
        },
      ],
    };
    expect(contextCitations(manifest)).toEqual(new Set([`citeladder://opportunity/${id}`]));
    expect(
      renderManifest({
        ...manifest,
        package: {
          ...emptyPackage,
          brand_block: 'x'.repeat(agentPolicy.context_package_max_chars),
        },
      }).length,
    ).toBeLessThanOrEqual(agentPolicy.context_package_max_chars);
    expect(bounded('123456', 3, 'CUT')).toBe('CUT');
    expect(() => parseStep('{"action":"respond","reply":"  "}')).toThrow('protocol_violation');
  });
  it('freezes instruction revisions and pages persisted chats without doing work', async () => {
    const scope = await fixtures.scope();
    const outputs = new AgentOutputs(db);
    await outputs.saveInstructions(scope, 'Use a concise voice.');
    const a = await fixtures.store().enqueue(scope, { key: randomUUID(), message: 'First' });
    await outputs.saveInstructions(scope, 'Use a formal voice.');
    const b = await fixtures.store().enqueue(scope, { key: randomUUID(), message: 'Second' });
    await db
      .updateTable('agent_chats')
      .set({ last_activity_at: sql<Date>`'2026-01-01T00:00:00.123455Z'::timestamptz` })
      .where('id', '=', a.chat_id)
      .execute();
    await db
      .updateTable('agent_chats')
      .set({ last_activity_at: sql<Date>`'2026-01-01T00:00:00.123456Z'::timestamptz` })
      .where('id', '=', b.chat_id)
      .execute();
    expect((await readChat(db, scope, a.chat_id)).context.instructions).toMatchObject({
      revision: 1,
      text: 'Use a concise voice.',
    });
    expect((await readChat(db, scope, b.chat_id)).context.instructions).toMatchObject({
      revision: 2,
    });
    const page = await listChats(db, scope, { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(b.chat_id);
    const next = await listChats(db, scope, { limit: 1, cursor: page.next_cursor! });
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
    expect(next.items[0]?.id).toBe(a.chat_id);
    await fixtures.store().cancel(scope, a.chat_id, a.id);
    await fixtures.store().archive(scope, a.chat_id);
    expect((await listChats(db, scope)).items.map((chat) => chat.id)).toEqual([b.chat_id]);
  });
  it('runs the bounded worker unit with an explicit tenant set', async () => {
    const scope = await fixtures.scope();
    const queued = await fixtures
      .store()
      .enqueue(scope, { key: randomUUID(), message: 'Answer this' });
    const queue = new AgentQueue(db, 30);
    const runtime = fixtures.runtime(scope, scripted([reply()]));
    expect(await runAgentOnce(queue, runtime, 'bounded-worker', [], () => 0)).toBe(false);
    expect(await runAgentOnce(queue, runtime, 'bounded-worker', [scope.workspaceId], () => 0)).toBe(
      true,
    );
    expect((await fixtures.run(queued.id)).status).toBe('succeeded');
  });
  it('retries classified transient failures, stops malformed steps and recovers abandoned cancellations', async () => {
    const scope = await fixtures.scope();
    const queued = await fixtures
      .store()
      .enqueue(scope, { key: randomUUID(), message: 'Question' });
    const queue = new AgentQueue(db, 30);
    const model = {
      ...scripted([]),
      retryableError: () => true,
      complete: async () => {
        throw new Error('Transient fixture');
      },
    };
    await runAgentOnce(
      queue,
      fixtures.runtime(scope, model),
      'retry-worker',
      [scope.workspaceId],
      () => 0,
    );
    expect(await fixtures.run(queued.id)).toMatchObject({ status: 'retry_wait', attempt_count: 1 });
    await runAgentOnce(
      queue,
      fixtures.runtime(scope, scripted(['invalid', 'invalid'])),
      'retry-worker',
      [scope.workspaceId],
      () => 0,
    );
    expect(await fixtures.run(queued.id)).toMatchObject({
      status: 'failed',
      error_code: 'protocol_violation',
    });
    const turn = await fixtures.claimed(scope);
    const calls = new ModelCalls(db, zeroFunding);
    const attempt = await calls.dispatch(turn.lease, 1, scripted([]), {
      system: 'test',
      user: 'test',
      schema: {},
    });
    await fixtures.store().cancel(scope, turn.run.chat_id, turn.run.id);
    await db
      .updateTable('agent_model_attempts')
      .set({ deadline_at: new Date(0) })
      .where('id', '=', attempt.id)
      .execute();
    expect(await calls.recoverCancelled([scope.workspaceId], 1, 0)).toBe(1);
    expect(await calls.recoverCancelled([scope.workspaceId], 1, 0)).toBe(0);
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('outcome')
        .where('id', '=', attempt.id)
        .executeTakeFirst(),
    ).toMatchObject({ outcome: 'recovered_unknown' });
  });
  it('requires finite platform holds and freezes their pricing/cap for unknown settlement', async () => {
    const scope = await fixtures.scope();
    const { run, lease, queue } = await fixtures.claimed(scope);
    await db
      .updateTable('agent_runs')
      .set({ funding_source: 'platform' })
      .where('id', '=', run.id)
      .execute();
    const unfunded = new ModelCalls(db, zeroFunding);
    await expect(
      unfunded.dispatch(lease, 1, scripted([]), { system: 'test', user: 'test', schema: {} }),
    ).rejects.toMatchObject({ code: 'funding_unavailable' });
    const reservation = randomUUID();
    const settlement = vi.fn<Funding['settle']>(async (_db, attempt, receipt) => {
      expect(attempt).toMatchObject({
        reservation_id: reservation,
        reserved_credits: '50',
        pricing_revision: 'frozen-policy',
      });
      expect(receipt).toBeNull();
      return { credits: 50, status: 'unknown_policy' };
    });
    const models = new ModelCalls(db, {
      reserve: async () => ({
        reservationId: reservation,
        credits: 50,
        pricingRevision: 'frozen-policy',
      }),
      settle: settlement,
    });
    const attempt = await models.dispatch(lease, 1, scripted([]), {
      system: 'test',
      user: 'test',
      schema: {},
    });
    await db
      .updateTable('agent_runs')
      .set({ lease_expires_at: new Date(0) })
      .where('id', '=', run.id)
      .execute();
    await queue.recover([scope.workspaceId], 1, (trx, row) => models.reconcile(trx, row));
    await models.receipt(scope.workspaceId, attempt.id, result(reply()));
    expect(settlement).toHaveBeenCalledTimes(1);
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['debited_credits', 'settlement_status'])
        .where('id', '=', attempt.id)
        .executeTakeFirst(),
    ).toEqual({ debited_credits: '50', settlement_status: 'unknown_policy' });
  });
  it('fences a moved output base and never commits its reply on top of that revision', async () => {
    const scope = await fixtures.scope();
    const first = await fixtures.claimed(scope, { skillId: 'plan' });
    await fixtures.runtime(scope, scripted([deliverable('final')])).execute(first.lease);
    const initial = (await readChat(db, scope, first.run.chat_id)).output!.latest_revision!;
    const followup = await fixtures.claimed(scope, {
      chatId: first.run.chat_id,
      message: 'Revise',
    });
    let changedId = '';
    await fixtures
      .runtime(
        scope,
        scripted([deliverable('final', 'Stale model body')], async () => {
          const source = await db
            .selectFrom('agent_output_revisions')
            .selectAll()
            .where('id', '=', initial.id)
            .executeTakeFirstOrThrow();
          changedId = randomUUID();
          await db
            .insertInto('agent_output_revisions')
            .values({
              ...source,
              id: changedId,
              number: 2,
              parent_revision_id: source.id,
              author: 'user',
              author_user_id: scope.userId,
              run_id: null,
              message_id: null,
              body: 'A concurrently committed revision',
              source_refs: JSON.stringify(source.source_refs),
              created_at: new Date(),
            })
            .execute();
        }),
      )
      .execute(followup.lease);
    const detail = await readChat(db, scope, first.run.chat_id);
    expect(detail.latest_run?.error_code).toBe('output_conflict');
    expect(detail.messages.map((message) => message.role)).toEqual(['user', 'agent', 'user']);
    expect(detail.output!.latest_revision!.id).toBe(changedId);
  });
  it('leaves unsettled dispatches recoverable when accounting is temporarily unavailable', async () => {
    const scope = await fixtures.scope();
    const { run, lease, queue } = await fixtures.claimed(scope);
    const models = new ModelCalls(db, {
      ...zeroFunding,
      settle: async () => {
        throw new Error('Accounting unavailable');
      },
    });
    await expect(
      fixtures.runtime(scope, scripted([reply()]), { models }).execute(lease),
    ).rejects.toThrow('Accounting unavailable');
    expect((await fixtures.run(run.id)).status).toBe('running');
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('outcome')
        .where('run_id', '=', run.id)
        .executeTakeFirst(),
    ).toMatchObject({ outcome: 'dispatched' });
    await db
      .updateTable('agent_runs')
      .set({ lease_expires_at: new Date(0) })
      .where('id', '=', run.id)
      .execute();
    const restored = new ModelCalls(db, zeroFunding);
    await queue.recover([scope.workspaceId], 1, (trx, row) => restored.reconcile(trx, row));
    expect((await fixtures.run(run.id)).status).toBe('retry_wait');
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('outcome')
        .where('run_id', '=', run.id)
        .executeTakeFirst(),
    ).toMatchObject({ outcome: 'recovered_unknown' });
  });
  it('lets a model repair an unknown skill within the frozen protocol-error bound', async () => {
    const scope = await fixtures.scope();
    const { run, lease } = await fixtures.claimed(scope);
    await fixtures
      .runtime(
        scope,
        scripted([
          { action: 'select_skill', skill_id: 'unknown' },
          { action: 'select_skill', skill_id: 'plan' },
          reply(),
        ]),
      )
      .execute(lease);
    expect(await fixtures.run(run.id)).toMatchObject({
      status: 'succeeded',
      skill_id: 'plan',
      steps_used: 3,
    });
  });
});
