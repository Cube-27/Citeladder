import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { asOwner, testDatabase } from './support.ts';
import {
  AgentFixtures,
  read,
  reply,
  request,
  result,
  save,
  text,
  type Response,
} from './agent-support.ts';
import { recoveryReply } from '../src/agent/messages.ts';
import { runAgentOnce } from '../src/agent/worker.ts';
import { BillingFixtures } from './billing-support.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { agentSettings } from '../src/agent/config.ts';
import { agentAdmission, agentFunding } from '../src/agent/funding.ts';
import { agentModels } from '../src/agent/models.ts';
import { gatewaySettings } from '../src/models/gateway.ts';
import { ModelError } from '../src/models/http.ts';
import { ModelCalls } from '../src/agent/model-calls.ts';
import { AgentQueue } from '../src/agent/queue.ts';
import { budgetSchema } from '../src/agent/contracts.ts';
import { ledgerBalances } from '../src/entitlements/ledger.ts';
import type { RequestedChoice } from '../src/agent/model-choice.ts';

const platform = {
  ...gatewaySettings({}),
  apiKey: 'fixture-key',
  baseUrl: 'https://model.test/v1',
  model: 'claude-haiku-5-5',
  maxOutputTokens: 16_384,
};
const HOLD = 11;
const OPUS_HOLD = 0;
const settings = agentSettings({});
describe('Agent funding through the production ledger and shared pricing', () => {
  const db = testDatabase();
  const agents = new AgentFixtures(db),
    billing = new BillingFixtures(db);
  afterAll(async () => {
    await billing.cleanup();
    await agents.cleanup();
    await db.destroy();
  });
  async function tenant(credits = 100) {
    const scope = await agents.scope();
    const accountId = await billingAccount(db, scope.workspaceId);
    billing.accounts.push(accountId);
    await grant(db, accountId, { key: 'agent', value: 1 });
    const grantId = await grant(db, accountId, {
      key: 'ai_credits',
      value: credits,
    });
    return { scope, accountId, grantId };
  }
  async function run(
    scope: Awaited<ReturnType<typeof agents.scope>>,
    skillId?: string,
    choice?: RequestedChoice,
  ) {
    const store = agents.store({
      admission: agentAdmission(settings, platform),
    });
    const run = await store.enqueue(scope, {
      key: randomUUID(),
      message: 'Answer from evidence.',
      ...(skillId ? { skillId } : {}),
      choice,
    });
    const queue = new AgentQueue(db, 30);
    const claimed = await queue.claim('funding-test', [scope.workspaceId]);
    if (!claimed || claimed.id !== run.id) throw new Error('Unexpected claim');
    return { run, lease: await queue.start(claimed, 'funding-test'), queue };
  }
  it('commits the hold before I/O, charges the reported tokens once and releases the rest', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const io = {
      fetch: vi.fn<typeof fetch>(async () => {
        expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)?.reserved).toBe(HOLD);
        return Response.json({
          choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        });
      }),
      sleep: vi.fn(async () => {}),
    };
    const model = await agentModels(platform, io)(saved);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.call(lease, 1, model, request);
    const attempt = await db
      .selectFrom('agent_model_attempts')
      .selectAll()
      .where('run_id', '=', saved.id)
      .executeTakeFirstOrThrow();
    expect(attempt).toMatchObject({
      reserved_credits: String(HOLD),
      pricing_revision: 'ai-pricing-v1',
    });
    await calls.receipt(scope.workspaceId, attempt.id, result(reply('changed late answer')));
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 1,
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['active', 'daily'] as const)(
    'refuses the %s admission limit with a retry window',
    async (boundary) => {
      const { scope } = await tenant();
      const limits = {
        ...settings,
        activeLimit: boundary === 'active' ? 1 : 10,
        dailyRuns: { ...settings.dailyRuns, limit: 1 },
      };
      const store = agents.store({
        admission: agentAdmission(limits, platform),
      });
      await store.enqueue(scope, { key: randomUUID(), message: 'First turn' });
      await expect(
        store.enqueue(scope, { key: randomUUID(), message: 'Over limit' }),
      ).rejects.toMatchObject({
        status: 429,
        headers: { 'retry-after': expect.any(String) },
      });
    },
  );
  it('charges nothing for a failed dispatch that reported no usage', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const model = {
      ...(await agentModels(platform)(saved)),
      converse: async () => {
        throw new Error('Provider unavailable');
      },
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await expect(calls.call(lease, 1, model, request)).rejects.toMatchObject({
      code: 'provider_error',
    });
    const attempt = await db
      .selectFrom('agent_model_attempts')
      .selectAll()
      .where('run_id', '=', saved.id)
      .executeTakeFirstOrThrow();
    await calls.receipt(scope.workspaceId, attempt.id, null);
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 0,
    });
  });
  it('records and charges the usage a failed call still reported, as platform metering does', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const model = {
      ...(await agentModels(platform)(saved)),
      converse: async () => {
        throw new ModelError('parse', undefined, undefined, {
          input_tokens: 20,
          output_tokens: 10,
        });
      },
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await expect(calls.call(lease, 1, model, request)).rejects.toMatchObject({
      code: 'provider_error',
    });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['outcome', 'input_tokens', 'output_tokens', 'debited_credits'])
        .where('run_id', '=', saved.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      outcome: 'failed',
      input_tokens: '20',
      output_tokens: '10',
      debited_credits: '1',
    });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 1,
    });
  });
  it('refunds a failed turn’s settled calls once, keeping each attempt’s debit on record (B58)', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const balances: unknown[] = [];
    const model = {
      ...(await agentModels(platform)(saved)),
      converse: async () => {
        balances.push((await ledgerBalances(db, accountId, [grantId])).get(grantId)?.consumed);
        return result(reply('Cut off'), { stop: 'max_tokens' });
      },
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await agents.runtime(scope, model, { models: calls }).execute(lease);
    expect(balances).toEqual([0, 1]);
    expect(await agents.run(saved.id)).toMatchObject({
      status: 'failed',
      error_code: 'output_too_long',
    });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 0,
    });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['ordinal', 'debited_credits', 'input_tokens'])
        .where('run_id', '=', saved.id)
        .orderBy('ordinal')
        .execute(),
    ).toEqual([
      { ordinal: 1, debited_credits: '1', input_tokens: '20' },
      { ordinal: 2, debited_credits: '1', input_tokens: '20' },
    ]);
    await db.transaction().execute(async (trx) => {
      await calls.settleFailed(trx, await agents.run(saved.id));
    });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)?.consumed).toBe(0);
  });
  it('settles an answer with unreadable usage at the fixed fallback, within the hold', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const attempt = await calls.dispatch(lease, 1, await agentModels(platform)(saved), request);
    await calls.receipt(scope.workspaceId, attempt.id, result(reply(), { usage: {} }));
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 10,
    });
  });
  it('charges cache writes at the write rate and thinking only as output (B53)', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const attempt = await calls.dispatch(lease, 1, await agentModels(platform)(saved), request);
    const usage = {
      input_tokens: 40_000,
      cached_input_tokens: 0,
      cache_write_input_tokens: 40_000,
      output_tokens: 2_000,
      reasoning_tokens: 1_500,
    };
    await calls.receipt(scope.workspaceId, attempt.id, result(reply(), { usage }));
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 8,
    });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['cache_write_input_tokens', 'reasoning_tokens', 'debited_credits'])
        .where('id', '=', attempt.id)
        .executeTakeFirst(),
    ).toEqual({
      cache_write_input_tokens: '40000',
      reasoning_tokens: '1500',
      debited_credits: '8',
    });
  });
  it('holds a call’s web search allowance and charges only the searches it ran (B59)', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const searching = { ...request, webSearches: 2 };
    const attempt = await calls.dispatch(lease, 1, await agentModels(platform)(saved), searching);
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)?.reserved).toBe(HOLD + 26);
    const usage = {
      input_tokens: 20,
      output_tokens: 10,
      web_search_requests: 1,
    };
    await calls.receipt(scope.workspaceId, attempt.id, result(reply(), { usage }));
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 14,
    });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['web_search_requests', 'debited_credits', 'cost_microusd'])
        .where('id', '=', attempt.id)
        .executeTakeFirst(),
    ).toEqual({
      web_search_requests: 1,
      debited_credits: '14',
      cost_microusd: '10007',
    });
    expect(
      await db
        .selectFrom('internal_costs')
        .select(['source', 'feature', 'charge', 'cost_microusd'])
        .where('source_id', '=', attempt.id)
        .execute(),
    ).toEqual([
      {
        source: 'agent_model_call',
        feature: 'agent',
        charge: 'credits',
        cost_microusd: '10007',
      },
    ]);
  });
  it('shrinks a call the balance covers only in part to the output it can pay for (B60)', async () => {
    const { scope, accountId, grantId } = await tenant(5);
    const { run: saved, lease } = await run(scope);
    const sent: unknown[] = [];
    const io = {
      fetch: vi.fn<typeof fetch>(async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)).max_completion_tokens);
        return Response.json({
          choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        });
      }),
      sleep: vi.fn(async () => {}),
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.call(lease, 1, await agentModels(platform, io)(saved), request);
    expect(sent).toEqual([7652]);
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['reserved_credits', 'max_output_tokens'])
        .where('run_id', '=', saved.id)
        .executeTakeFirst(),
    ).toEqual({ reserved_credits: '5', max_output_tokens: 7652 });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 1,
    });
  });
  it('refuses a call below a minimum reply, counting only its own workspace’s credits', async () => {
    await tenant(1_000);
    const { scope } = await tenant(2);
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await expect(
      calls.dispatch(lease, 1, await agentModels(platform)(saved), request),
    ).rejects.toMatchObject({ code: 'funding_unavailable' });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('id')
        .where('run_id', '=', saved.id)
        .execute(),
    ).toEqual([]);
  });
  it('holds a later call for the input the previous call reported, never below what it can cost', async () => {
    const { scope, accountId, grantId } = await tenant(1_000);
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const model = await agentModels(platform)(saved);
    const opening = {
      role: 'user' as const,
      content: [text('x'.repeat(100_000))],
    };
    const first = await calls.dispatch(lease, 1, model, {
      ...request,
      messages: [opening],
    });
    expect(first.reserved_credits).toBe('37');
    const reported = { input_tokens: 25_000, output_tokens: 1_000 };
    await calls.receipt(scope.workspaceId, first.id, result(reply(), { usage: reported }));
    const next = {
      ...request,
      messages: [
        opening,
        { role: 'assistant' as const, content: [text('ok')] },
        { role: 'user' as const, content: [text('more')] },
      ],
    };
    const second = await calls.dispatch(lease, 2, model, next);
    expect(second.reserved_credits).toBe('18');
    const worst = {
      input_tokens: 26_119,
      cache_write_input_tokens: 26_119,
      cache_write_1h_input_tokens: 26_119,
      output_tokens: 16_384,
    };
    await calls.receipt(scope.workspaceId, second.id, result(reply(), { usage: worst }));
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['ordinal', 'reserved_credits', 'debited_credits', 'input_bytes'])
        .where('run_id', '=', saved.id)
        .orderBy('ordinal')
        .execute(),
    ).toEqual([
      {
        ordinal: 1,
        reserved_credits: '37',
        debited_credits: '4',
        input_bytes: '100095',
      },
      {
        ordinal: 2,
        reserved_credits: '18',
        debited_credits: '18',
        input_bytes: '100214',
      },
    ]);
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 22,
    });
  });
  it('keeps a document already written when a later call is refused, and charges for it', async () => {
    const { scope, accountId, grantId } = await tenant(8);
    const { run: saved, lease } = await run(scope, 'plan');
    const responses = [
      result(save('The finished plan.'), {
        usage: { input_tokens: 100_000, output_tokens: 16_384 },
      }),
      result(reply('Never reached.')),
    ];
    const model = {
      ...(await agentModels(platform)(saved)),
      converse: async () => responses.shift()!,
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await agents.runtime(scope, model, { models: calls }).execute(lease);
    expect(await agents.run(saved.id)).toMatchObject({
      status: 'succeeded',
      error_code: '',
    });
    const message = await db
      .selectFrom('agent_messages')
      .select('content')
      .where('workspace_id', '=', scope.workspaceId)
      .where('reply_to_message_id', '=', saved.user_message_id)
      .executeTakeFirstOrThrow();
    expect(message.content).toBe(
      'I ran out of AI credits before writing a summary.\n\nDocument 1 saved.',
    );
    const revision = await db
      .selectFrom('agent_output_revisions')
      .select('body')
      .where('run_id', '=', saved.id)
      .executeTakeFirstOrThrow();
    expect(revision.body).toBe('The finished plan.');
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 8,
    });
  });
  async function closedAfter(first: Response, skillId?: string) {
    const { scope, accountId, grantId } = await tenant();
    const store = agents.store({ admission: agentAdmission(settings, platform) });
    const queued = await store.enqueue(scope, {
      key: randomUUID(),
      message: 'Write the plan.',
      ...(skillId ? { skillId } : {}),
    });
    const browser = new AbortController();
    const responses = [result(first)];
    const model = {
      ...(await agentModels(platform)(queued)),
      converse: async (_request: unknown, signal?: AbortSignal) => {
        const next = responses.shift();
        if (next) return next;
        browser.abort();
        signal?.throwIfAborted();
        throw new Error('The browser closed first');
      },
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await runAgentOnce(
      new AgentQueue(db, 30),
      agents.runtime(scope, model, { models: calls }),
      'closing-browser',
      [scope.workspaceId],
      { runId: queued.id, signal: browser.signal },
    );
    const replies = await db
      .selectFrom('agent_messages')
      .select('content')
      .where('workspace_id', '=', scope.workspaceId)
      .where('reply_to_message_id', '=', queued.user_message_id)
      .execute();
    const revisions = await db
      .selectFrom('agent_output_revisions')
      .select('body')
      .where('run_id', '=', queued.id)
      .execute();
    return {
      run: await agents.run(queued.id),
      replies: replies.map(({ content }) => content),
      revisions: revisions.map(({ body }) => body),
      balance: (await ledgerBalances(db, accountId, [grantId])).get(grantId),
    };
  }
  it('saves a document already streamed when the browser closes the turn, and charges for it (B69)', async () => {
    const kept = await closedAfter(save('The streamed plan.'), 'plan');
    expect(kept.run).toMatchObject({ status: 'succeeded', error_code: '' });
    expect(kept.replies).toEqual([
      'The chat was closed before I wrote a summary.\n\nDocument 1 saved.',
    ]);
    expect(kept.revisions).toEqual(['The streamed plan.']);
    expect(kept.balance).toEqual({ reserved: 0, consumed: 1 });
    const refunded = await closedAfter(read());
    expect(refunded.run).toMatchObject({ status: 'failed', error_code: 'interrupted' });
    expect(refunded.replies).toEqual([recoveryReply('interrupted')]);
    expect(refunded.revisions).toEqual([]);
    expect(refunded.balance).toEqual({ reserved: 0, consumed: 0 });
  });
  it('refunds a Stop on a turn whose lease already lapsed, and charges a Stop on a live one (B69)', async () => {
    const stop = async (lapsed: boolean) => {
      const { scope, accountId, grantId } = await tenant();
      const { run: saved, lease } = await run(scope);
      const calls = new ModelCalls(db, agentFunding(settings, platform));
      const model = {
        ...(await agentModels(platform)(saved)),
        converse: async () => result(reply()),
      };
      await calls.call(lease, 1, model, request);
      if (lapsed)
        await db
          .updateTable('agent_runs')
          .set({ lease_expires_at: new Date(Date.now() - 1000) })
          .where('id', '=', saved.id)
          .execute();
      await agents
        .store({ settleFailed: (trx, row) => calls.settleFailed(trx, row) })
        .cancel(scope, saved.chat_id, saved.id);
      const replies = await db
        .selectFrom('agent_messages')
        .select('content')
        .where('workspace_id', '=', scope.workspaceId)
        .where('reply_to_message_id', '=', saved.user_message_id)
        .execute();
      return {
        run: await agents.run(saved.id),
        replies: replies.map(({ content }) => content),
        balance: (await ledgerBalances(db, accountId, [grantId])).get(grantId),
      };
    };
    const dead = await stop(true);
    expect(dead.run).toMatchObject({
      status: 'failed',
      error_code: 'interrupted',
      lease_owner: null,
      cancelled_at: null,
    });
    expect(dead.replies).toEqual([recoveryReply('interrupted')]);
    expect(dead.balance).toEqual({ reserved: 0, consumed: 0 });
    const live = await stop(false);
    expect(live.run).toMatchObject({ status: 'cancelled', error_code: 'cancelled' });
    expect(live.replies).toEqual([recoveryReply('cancelled')]);
    expect(live.balance).toEqual({ reserved: 0, consumed: 1 });
  });
  it('serializes concurrent dispatch holds against the same finite credit balance', async () => {
    const { scope, accountId, grantId } = await tenant(HOLD);
    const first = await run(scope),
      second = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const outcomes = await Promise.allSettled(
      [first, second].map(async (current) =>
        calls.dispatch(current.lease, 1, await agentModels(platform)(current.run), request),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'funding_unavailable' },
    });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: HOLD,
      consumed: 0,
    });
  });
  it('holds and settles a chosen model at its own price row, not the default one', async () => {
    const { scope, accountId, grantId } = await tenant(1_000);
    const { run: saved, lease } = await run(scope, undefined, { model: 'claude-opus-5-5' });
    const io = {
      fetch: vi.fn<typeof fetch>(async (_url, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'claude-opus-5-5' });
        return Response.json({
          choices: [{ message: { content: 'Answer' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1_000, completion_tokens: 1_000 },
        });
      }),
      sleep: vi.fn(async () => {}),
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.call(lease, 1, await agentModels(platform, io)(saved), request);
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select(['requested_model', 'reserved_credits', 'debited_credits', 'cost_microusd'])
        .where('run_id', '=', saved.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({
      requested_model: 'claude-opus-5-5',
      reserved_credits: String(OPUS_HOLD),
      debited_credits: '32',
      cost_microusd: '24000',
    });
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 32,
    });
  });
  it('refuses a run whose model is no longer offered, before any call', async () => {
    const { scope } = await tenant();
    const { run: saved } = await run(scope);
    await expect(
      agentModels(platform)({ ...saved, requested_model: 'claude-retired-model' }),
    ).rejects.toMatchObject({ code: 'model_unavailable' });
  });
  it('admits an offered model and effort, pins both on the chat and freezes them on each run', async () => {
    const { scope } = await tenant();
    const store = agents.store({ admission: agentAdmission(settings, platform) });
    const send = (choice: RequestedChoice, chatId?: string) =>
      store.enqueue(scope, { key: randomUUID(), message: 'Next turn', chatId, choice });
    const pinned = async (chatId: string) =>
      db
        .selectFrom('agent_chats')
        .select(['model', 'reasoning_effort'])
        .where('id', '=', chatId)
        .executeTakeFirstOrThrow();
    const frozen = (queued: { requested_model: string; budget: unknown }) => [
      queued.requested_model,
      budgetSchema.parse(queued.budget).reasoning_effort,
    ];
    const first = await send({ model: 'claude-opus-5-5', effort: 'high' });
    expect(frozen(first)).toEqual(['claude-opus-5-5', 'high']);
    expect(await pinned(first.chat_id)).toEqual({
      model: 'claude-opus-5-5',
      reasoning_effort: 'high',
    });
    await store.cancel(scope, first.chat_id, first.id);
    const unreplied = await send({ model: 'claude-sonnet-5-5' }, first.chat_id);
    expect(frozen(unreplied)).toEqual(['claude-sonnet-5-5', 'high']);
    await db
      .insertInto('agent_run_transcripts')
      .values({
        id: randomUUID(),
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        chat_id: first.chat_id,
        run_id: unreplied.id,
        context_hash: '',
        messages: JSON.stringify([]),
        model: 'claude-sonnet-5-5',
        provider_adapter: 'anthropic',
        skill_id: null,
        created_at: new Date(),
      })
      .execute();
    await store.cancel(scope, first.chat_id, unreplied.id);
    await expect(send({ model: 'claude-haiku-5-5' }, first.chat_id)).rejects.toMatchObject({
      code: 'model_locked',
    });
    const lowered = await send({ effort: 'low' }, first.chat_id);
    expect(frozen(lowered)).toEqual(['claude-sonnet-5-5', 'low']);
    expect(await pinned(first.chat_id)).toEqual({
      model: 'claude-sonnet-5-5',
      reasoning_effort: 'low',
    });
    const fresh = await send({});
    expect(frozen(fresh)).toEqual(['claude-haiku-5-5', 'medium']);
  });
  it('refuses a model outside the allow-list and a workspace without the Agent entitlement', async () => {
    const { scope } = await tenant();
    const store = agents.store({ admission: agentAdmission(settings, platform) });
    await expect(
      store.enqueue(scope, {
        key: randomUUID(),
        message: 'Hi',
        choice: { model: 'gpt-6.1-terra' },
      }),
    ).rejects.toMatchObject({ code: 'model_unavailable' });
    const trial = await agents.scope();
    const trialAccount = await billingAccount(db, trial.workspaceId);
    billing.accounts.push(trialAccount);
    await grant(db, trialAccount, { key: 'ai_credits', value: 500 });
    await expect(
      store.enqueue(trial, {
        key: randomUUID(),
        message: 'Hi',
        choice: { model: 'claude-opus-5-5', effort: 'high' },
      }),
    ).rejects.toMatchObject({ code: 'capability_unavailable' });
    expect(
      await db
        .selectFrom('agent_chats')
        .select('id')
        .where('workspace_id', 'in', [scope.workspaceId, trial.workspaceId])
        .execute(),
    ).toEqual([]);
  });
  it('recognizes the development login only in a development environment', () => {
    const login = { DEV_LOGIN_EMAIL: 'developer@example.test', DEV_LOGIN_PASSWORD: 'fixture-pw' };
    expect(
      ['development', 'production'].map(
        (APP_ENV) => agentSettings({ ...login, APP_ENV }).devPasswordConfigured,
      ),
    ).toEqual([true, false]);
  });
  it('admits development funding only for the configured active administrator', async () => {
    const { scope } = await tenant();
    const dev = {
      ...settings,
      devEmail: 'developer@example.test',
      devPasswordConfigured: true,
    };
    await db
      .updateTable('users')
      .set({ email: dev.devEmail, role: 'admin' })
      .where('id', '=', scope.userId)
      .execute();
    const admit = () =>
      db
        .transaction()
        .execute((trx) => agentAdmission(dev, platform)(trx, scope, 'claude-haiku-5-5'));
    expect((await admit()).funding_source).toBe('development');
    await db.updateTable('users').set({ role: 'user' }).where('id', '=', scope.userId).execute();
    expect((await admit()).funding_source).toBe('platform');
    await asOwner((owner) =>
      owner
        .updateTable('account_grants')
        .set({ valid_until: new Date(Date.now() - 1000) })
        .where(
          'billing_account_id',
          'in',
          db
            .selectFrom('billing_accounts')
            .select('id')
            .where('workspace_id', '=', scope.workspaceId),
        )
        .where('key', '=', 'agent')
        .execute(),
    );
    await expect(admit()).rejects.toMatchObject({
      code: 'capability_unavailable',
    });
  });
});
