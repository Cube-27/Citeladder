import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './support.ts';
import { AgentFixtures, reply, request, result, save, text } from './agent-support.ts';
import { BillingFixtures } from './billing-support.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { agentSettings } from '../src/agent/config.ts';
import { agentAdmission, agentFunding } from '../src/agent/funding.ts';
import { agentModels } from '../src/agent/models.ts';
import { gatewaySettings } from '../src/models/gateway.ts';
import { ModelError } from '../src/models/http.ts';
import { ModelCalls } from '../src/agent/model-calls.ts';
import { AgentQueue } from '../src/agent/queue.ts';
import { ledgerBalances } from '../src/entitlements/ledger.ts';

// The platform model, priced in configuration at Claude Haiku 5.5 rates.
const platform = {
  ...gatewaySettings({}),
  apiKey: 'fixture-key',
  baseUrl: 'https://model.test/v1',
  model: 'claude-haiku-5-5',
  maxOutputTokens: 16_384,
};
// A small request with the full output cap at the marked-up price.
const HOLD = 11;
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
  async function run(scope: Awaited<ReturnType<typeof agents.scope>>, skillId?: string) {
    const store = agents.store({
      admission: agentAdmission(settings, platform),
    });
    const run = await store.enqueue(scope, {
      key: randomUUID(),
      message: 'Answer from evidence.',
      ...(skillId ? { skillId } : {}),
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
        dailyLimit: 1,
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
      // Every call is cut off, so the turn fails after its low-effort retry.
      converse: async () => {
        balances.push((await ledgerBalances(db, accountId, [grantId])).get(grantId)?.consumed);
        return result(reply('Cut off'), { stop: 'max_tokens' });
      },
    };
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await agents.runtime(scope, model, { models: calls }).execute(lease);
    // The first call was charged before the retry ran.
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
    // A repeated settlement of the same failed turn refunds nothing more.
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
    // 40 000 written tokens at the write rate plus 2 000 output tokens, 1 500 of them thinking.
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
    // Two searches at $10 per 1,000 with the 130% markup add 26 credits to the token hold.
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
    // The internal-cost view carries the call at its cost before markup:
    // $0.000002 input + $0.000005 output + $0.01 for the search.
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
    // Five credits pay for the 99 input bytes and 7 652 output tokens, not the 16 384 cap.
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
    // Another workspace's large balance is never drawn on.
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
    // 100 095 bytes held as one-hour cache writes, plus the output cap.
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
    // 26 000 tokens read before, 119 bytes added and the 2 048-token margin.
    expect(second.reserved_credits).toBe('18');
    // The most it can cost: everything it reads written to the one-hour cache, the whole cap.
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
      // The first call writes the document and is charged everything it held.
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
    // Work was delivered, so the call is not refunded.
    expect((await ledgerBalances(db, accountId, [grantId])).get(grantId)).toEqual({
      reserved: 0,
      consumed: 8,
    });
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
  it('refuses a model change between admission and dispatch', async () => {
    const { scope } = await tenant();
    const { run: saved } = await run(scope);
    await expect(agentModels({ ...platform, model: 'another-model' })(saved)).rejects.toMatchObject(
      { code: 'model_changed' },
    );
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
      db.transaction().execute((trx) => agentAdmission(dev, platform)(trx, scope));
    expect((await admit()).funding_source).toBe('development');
    await db.updateTable('users').set({ role: 'user' }).where('id', '=', scope.userId).execute();
    expect((await admit()).funding_source).toBe('platform');
    await db
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
      .execute();
    await expect(admit()).rejects.toMatchObject({
      code: 'capability_unavailable',
    });
  });
});
