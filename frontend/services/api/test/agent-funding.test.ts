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
import { chargeCredits } from '../src/billing/ai-credits.ts';
import { createConnection } from '../src/providers/connections.ts';
import { createConnectionInput } from '../src/providers/inputs.ts';
import { providerSettings } from '../src/providers/config.ts';
import { probeConnection } from '../src/providers/probes.ts';

const platform = {
  ...gatewaySettings({}),
  apiKey: 'fixture-key',
  baseUrl: 'https://model.test/v1',
  model: 'test-model',
};
const settings = agentSettings({});
const rate = {
  feature: 'agent' as const,
  model: 'test-model',
  input_credits_per_million: 100000,
  cached_input_credits_per_million: 50000,
  output_credits_per_million: 100000,
  reasoning_credits_per_million: 100000,
  call_credit_cap: 20,
  unknown_usage_charge: 12,
};
describe('Agent funding through the production ledger and providers', () => {
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
    await billing.catalog((payload) => {
      payload.ai_credit_policy = { version: 'fixture-1', rates: [rate] };
    });
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
  it('commits the exact hold before I/O, charges usage once and releases excess', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const io = {
      fetch: vi.fn<typeof fetch>(async () => {
        const attempts = await db
          .selectFrom('agent_model_attempts')
          .selectAll()
          .where('run_id', '=', saved.id)
          .execute();
        expect(attempts).toMatchObject([{ outcome: 'dispatched', reserved_credits: '20' }]);
        expect((await ledgerBalances(db, accountId)).get(grantId)?.reserved).toBe(20);
        return Response.json({
          choices: [{ message: { content: '{"action":"respond","reply":"Answer"}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        });
      }),
      sleep: vi.fn(async () => {}),
    };
    const model = await agentModels(db, 'fixture-cipher', platform, {
      platform: io,
      customer: async () => {
        throw new Error('Unexpected customer request');
      },
    })(saved);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.call(lease, 1, model, { system: 's', user: 'u', schema: {} });
    const attempt = await db
      .selectFrom('agent_model_attempts')
      .selectAll()
      .where('run_id', '=', saved.id)
      .executeTakeFirstOrThrow();
    await calls.receipt(scope.workspaceId, attempt.id, result('changed late answer'));
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 0,
      consumed: 3,
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });
  it('fences expired dispatches and settles unknown usage against historical policy', async () => {
    const { scope, accountId, grantId } = await tenant();
    const { run: saved, lease } = await run(scope);
    const model = await agentModels(db, 'fixture-cipher', platform)(saved);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.dispatch(lease, 1, model, { system: 's', user: 'u', schema: {} });
    await billing.catalog((payload) => {
      payload.ai_credit_policy = {
        version: 'new-fixture',
        rates: [{ ...rate, unknown_usage_charge: 1 }],
      };
    });
    await db.transaction().execute((trx) => calls.reconcile(trx, saved));
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 0,
      consumed: 12,
    });
  });
  it('refuses exhausted credits and configured but unverified BYOK without platform fallback', async () => {
    const { scope } = await tenant(1);
    const { run: saved, lease } = await run(scope);
    const model = await agentModels(db, 'fixture-cipher', platform)(saved);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await expect(
      calls.dispatch(lease, 1, model, { system: 's', user: 'u', schema: {} }),
    ).rejects.toMatchObject({ code: 'funding_unavailable' });
    expect(
      await db
        .selectFrom('agent_model_attempts')
        .select('id')
        .where('run_id', '=', saved.id)
        .execute(),
    ).toEqual([]);
    await createConnection(
      db,
      scope.workspaceId,
      scope.userId,
      createConnectionInput.parse({
        transport_provider: 'openai',
        api_key: 'fixture',
        app_routes: [
          {
            feature: 'agent',
            model: 'customer-model',
            api_base_url: 'https://customer.test/v1',
            disclosure_accepted: true,
          },
        ],
      }),
      'fixture-cipher',
      providerSettings({}),
    );
    await expect(
      db.transaction().execute((trx) => agentAdmission(settings, platform)(trx, scope)),
    ).rejects.toMatchObject({ code: 'route_unavailable' });
  });
  it('debits zero for exact verified BYOK and stops after key rotation', async () => {
    const { scope, accountId, grantId } = await tenant();
    const connection = await createConnection(
      db,
      scope.workspaceId,
      scope.userId,
      createConnectionInput.parse({
        transport_provider: 'openai',
        api_key: 'fixture',
        app_routes: [
          {
            feature: 'agent',
            model: 'customer-model',
            api_base_url: 'https://customer.test/v1',
            disclosure_accepted: true,
          },
        ],
      }),
      'fixture-cipher',
      providerSettings({}),
    );
    await probeConnection(
      db,
      scope.workspaceId,
      connection.id,
      'fixture-cipher',
      providerSettings({}),
      async () => ({ status: 200, body: { choices: [{ message: { content: 'ok' } }] } }),
    );
    const { run: saved, lease } = await run(scope);
    const send = vi.fn(async () => ({
      status: 200,
      body: {
        choices: [{ message: { content: '{"action":"respond","reply":"BYOK answer"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      },
    }));
    const model = await agentModels(db, 'fixture-cipher', platform, {
      platform: { fetch: vi.fn(), sleep: vi.fn() },
      customer: send,
    })(saved);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    await calls.call(lease, 1, model, { system: 's', user: 'u', schema: {} });
    expect(
      (await ledgerBalances(db, accountId)).get(grantId) ?? { reserved: 0, consumed: 0 },
    ).toEqual({ reserved: 0, consumed: 0 });
    await db
      .updateTable('provider_connections')
      .set({ credential_revision: randomUUID() })
      .where('id', '=', connection.id)
      .execute();
    await expect(
      calls.dispatch(lease, 2, model, { system: 's', user: 'u', schema: {} }),
    ).rejects.toMatchObject({ code: 'route_unavailable' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('bounds arithmetic and distinguishes invalid usage from observed zero', () => {
    expect(chargeCredits(rate, { input_tokens: 0, output_tokens: 0 })).toBe(1);
    expect(chargeCredits(rate, { input_tokens: true, output_tokens: 0 })).toBeNull();
    expect(
      chargeCredits(rate, {
        input_tokens: Number.MAX_SAFE_INTEGER,
        output_tokens: Number.MAX_SAFE_INTEGER,
      }),
    ).toBe(20);
  });
  it('serializes concurrent dispatch holds against the same finite credit balance', async () => {
    const { scope, accountId, grantId } = await tenant(20);
    const first = await run(scope),
      second = await run(scope);
    const calls = new ModelCalls(db, agentFunding(settings, platform));
    const outcomes = await Promise.allSettled(
      [first, second].map(async (current) => {
        const model = await agentModels(db, 'fixture-cipher', platform)(current.run);
        return calls.dispatch(current.lease, 1, model, { system: 's', user: 'u', schema: {} });
      }),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome.status === 'rejected')).toMatchObject({
      reason: { code: 'funding_unavailable' },
    });
    expect((await ledgerBalances(db, accountId)).get(grantId)).toEqual({
      reserved: 20,
      consumed: 0,
    });
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
