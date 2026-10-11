import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './support.ts';
import { AgentFixtures, result } from './agent-support.ts';
import { BillingFixtures } from './billing-support.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { agentSettings } from '../src/agent/config.ts';
import { agentAdmission, agentFunding } from '../src/agent/funding.ts';
import { agentModels } from '../src/agent/models.ts';
import { gatewaySettings } from '../src/models/gateway.ts';
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
// A 4-byte request with the full output cap at the marked-up price.
const HOLD = 11;
const request = { system: 's', user: 'u', schema: {} };
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
    const grantId = await grant(db, accountId, { key: 'ai_credits', value: credits });
    return { scope, accountId, grantId };
  }
  async function run(scope: Awaited<ReturnType<typeof agents.scope>>) {
    const store = agents.store({ admission: agentAdmission(settings, platform) });
    const run = await store.enqueue(scope, { key: randomUUID(), message: 'Answer from evidence.' });
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
        expect((await ledgerBalances(db, accountId)).get(grantId)?.reserved).toBe(HOLD);
        return Response.json({
          choices: [{ message: { content: '{"action":"respond","reply":"Answer"}' } }],
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
    await calls.receipt(scope.workspaceId, attempt.id, result('changed late answer'));
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 0,
      consumed: 1,
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['active', 'daily'] as const)(
    'refuses the %s admission limit with a retry window',
    async (boundary) => {
      const { scope } = await tenant();
      const limits = { ...settings, activeLimit: boundary === 'active' ? 1 : 10, dailyLimit: 1 };
      const store = agents.store({ admission: agentAdmission(limits, platform) });
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
      complete: async () => {
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
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 0,
      consumed: 0,
    });
  });
  it('settles an answer with unreadable usage at the fixed fallback, within the hold', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const attempt = await calls.dispatch(lease, 1, await agentModels(platform)(saved), request);
    await calls.receipt(scope.workspaceId, attempt.id, { ...result('{}'), usage: {} });
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 0,
      consumed: 10,
    });
  });
  it('refuses a dispatch the remaining credits cannot hold, recording nothing', async () => {
    const { scope } = await tenant(HOLD - 1);
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
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
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
    const dev = { ...settings, devEmail: 'developer@example.test', devPasswordConfigured: true };
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
    await expect(admit()).rejects.toMatchObject({ code: 'capability_unavailable' });
  });
});
