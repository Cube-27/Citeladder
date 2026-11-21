import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { createJevClient, jevSettings } from '../src/models/jev.ts';
import { UnmeteredCallError } from '../src/models/meter-scope.ts';
import { meterFor, settleAbandonedCalls } from '../src/billing/metering.ts';
import { policy } from '../src/config.ts';
import { competitorSearch } from '../src/commerce/discovery-provider.ts';
import {
  cachedReservationCredits,
  chargeCredits,
  modelPrice,
  reservationCredits,
} from '../src/billing/ai-pricing.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

function gateway(reply: () => Response | Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => reply());
  return {
    fetch,
    gateway: createModelGateway(
      {
        ...gatewaySettings({}),
        apiKey: 'fixture-key',
        baseUrl: 'https://model.test/v1',
        model: 'claude-haiku-5-5',
        maxOutputTokens: 100_000,
        attempts: 1,
      },
      { fetch, sleep: async () => {} },
    ),
  };
}
const answer = (content: string, usage: Record<string, number>) => () =>
  Response.json({ choices: [{ message: { content } }], usage });

async function credited(t: Tenant, credits: number) {
  const accountId = await billingAccount(db, t.workspaceId);
  await grant(db, accountId, { key: 'ai_credits', value: credits });
  return accountId;
}
async function spent(workspaceId: string) {
  const rows = await db
    .selectFrom('consumable_ledger')
    .select(['entry_kind', 'units'])
    .where('workspace_id', '=', workspaceId)
    .where('capability_key', '=', 'ai_credits')
    .execute();
  const total = (kind: string) =>
    rows.filter((row) => row.entry_kind === kind).reduce((sum, row) => sum + row.units, 0);
  return {
    held: total('reservation') - total('release'),
    debited: total('debit'),
  };
}
const calls = (workspaceId: string) =>
  db
    .selectFrom('platform_calls')
    .select(['feature', 'provider', 'charge', 'status', 'credits', 'input_tokens', 'output_tokens'])
    .where('workspace_id', '=', workspaceId)
    .orderBy('created_at')
    .execute();

describe('platform AI metering', () => {
  it('prices tokens at the serving model with the markup, in whole credits rounded up', () => {
    const haiku = modelPrice('claude-haiku-5-5', '')!;
    expect(chargeCredits(haiku, { input_tokens: 10_000, output_tokens: 2_000 })).toBe(3);
    expect(chargeCredits(haiku, { input_tokens: 10, output_tokens: null })).toBeNull();
    expect(
      chargeCredits(haiku, {
        input_tokens: 5,
        cached_input_tokens: 6,
        output_tokens: 1,
      }),
    ).toBeNull();
    expect(
      chargeCredits(haiku, {
        input_tokens: 1_000_000,
        cached_input_tokens: 800_000,
        cache_write_input_tokens: 100_000,
        output_tokens: 100_000,
      }),
    ).toBe(105);
    expect(
      chargeCredits(haiku, {
        input_tokens: 10,
        cached_input_tokens: 6,
        cache_write_input_tokens: 5,
        output_tokens: 1,
      }),
    ).toBeNull();
    expect(
      chargeCredits(haiku, {
        input_tokens: 1_000_000,
        cached_input_tokens: 800_000,
        cache_write_input_tokens: 100_000,
        cache_write_1h_input_tokens: 100_000,
        output_tokens: 100_000,
      }),
    ).toBe(115);
    expect(
      chargeCredits(haiku, {
        input_tokens: 10,
        cache_write_input_tokens: 2,
        cache_write_1h_input_tokens: 3,
        output_tokens: 1,
      }),
    ).toBeNull();
    expect(cachedReservationCredits(haiku, 1_000_000, 0)).toBe(260);
    expect(reservationCredits(haiku, 1_000_000, 0)).toBe(130);
    expect(modelPrice('unpriced-model', 'gateway-model')).toBeNull();
    expect(modelPrice('gateway-model', 'gateway-model')).toEqual(haiku);
  });

  it('refuses a model, JEV or research call made outside a metering scope', async () => {
    const { gateway: raw, fetch } = gateway(answer('{}', {}));
    await expect(raw.complete('s', 'u')).rejects.toBeInstanceOf(UnmeteredCallError);
    const jev = createJevClient({ ...jevSettings({}), apiKey: 'fixture-key' })!;
    await expect(jev.decide({}, {})).rejects.toBeInstanceOf(UnmeteredCallError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('holds credits before the call, settles the reported tokens once and records the call', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    let heldDuringCall = -1;
    const { gateway: raw } = gateway(async () => {
      heldDuringCall = (await spent(t.workspaceId)).held;
      return answer('{"ok":true}', {
        prompt_tokens: 10_000,
        completion_tokens: 2_000,
      })();
    });
    const metered = meterFor(db, t.workspaceId).gateway(raw, 'prompt_generation');
    await metered.structured('s', 'u', z.object({ ok: z.boolean() }));
    expect(heldDuringCall).toBeGreaterThan(0);
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 3 });
    expect(await calls(t.workspaceId)).toEqual([
      {
        feature: 'prompt_generation',
        provider: 'model_gateway',
        charge: 'credits',
        status: 'settled',
        credits: 3,
        input_tokens: 10_000,
        output_tokens: 2_000,
      },
    ]);
  });

  it('refuses a charged call the remaining credits cannot hold, before any I/O', async () => {
    const t = await fixtures.tenant();
    await credited(t, 1);
    const { gateway: raw, fetch } = gateway(
      answer('{}', { prompt_tokens: 1, completion_tokens: 1 }),
    );
    await expect(
      meterFor(db, t.workspaceId).gateway(raw, 'prompt_generation').complete('system', 'user'),
    ).rejects.toMatchObject({ status: 403, code: 'ai_credits_exhausted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('charges a paid but unparseable answer its tokens, and a failure with no usage nothing', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const unparseable = gateway(
      answer('not json', { prompt_tokens: 10_000, completion_tokens: 2_000 }),
    );
    await expect(
      meterFor(db, t.workspaceId)
        .gateway(unparseable.gateway, 'project_research')
        .structured('s', 'u', z.object({ ok: z.boolean() })),
    ).rejects.toMatchObject({ code: 'parse' });
    const failing = gateway(() => new Response('unavailable', { status: 503 }));
    await expect(
      meterFor(db, t.workspaceId).gateway(failing.gateway, 'project_research').complete('s', 'u'),
    ).rejects.toThrow();
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 3 });
    expect((await calls(t.workspaceId)).map((call) => [call.status, call.credits])).toEqual([
      ['settled', 3],
      ['failed', 0],
    ]);
  });

  it('records included and uncharged calls with their tokens, spending no credits', async () => {
    const t = await fixtures.tenant();
    const { gateway: raw } = gateway(
      answer('{"ok":true}', { prompt_tokens: 50, completion_tokens: 5 }),
    );
    const meter = meterFor(db, t.workspaceId);
    await meter
      .gateway(raw, 'answer_perception')
      .structured('s', 'u', z.object({ ok: z.boolean() }));
    await meter.call(
      'commerce_competitor_discovery',
      { provider: 'tavily', model: 'tavily' },
      async () => ({
        value: null,
        usage: null,
      }),
    );
    expect(await calls(t.workspaceId)).toEqual([
      {
        feature: 'answer_perception',
        provider: 'model_gateway',
        charge: 'included',
        status: 'settled',
        credits: 0,
        input_tokens: 50,
        output_tokens: 5,
      },
      {
        feature: 'commerce_competitor_discovery',
        provider: 'tavily',
        charge: 'not_charged',
        status: 'settled',
        credits: 0,
        input_tokens: null,
        output_tokens: null,
      },
    ]);
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 0 });
  });

  it('prices Tavily and Keenable per answered request and model calls at their tokens', async () => {
    const t = await fixtures.tenant();
    const meter = meterFor(db, t.workspaceId);
    const answered = async () => ({ value: null, usage: null });
    await meter.call(
      'commerce_competitor_discovery',
      { provider: 'tavily', model: 'tavily' },
      answered,
    );
    await meter.call('research_evidence', { provider: 'keenable', model: 'keenable' }, answered);
    await expect(
      meter.call('research_evidence', { provider: 'keenable', model: 'keenable' }, async () => {
        throw new Error('connection reset');
      }),
    ).rejects.toThrow('connection reset');
    const { gateway: raw } = gateway(
      answer('{"ok":true}', { prompt_tokens: 50, completion_tokens: 5 }),
    );
    await meter
      .gateway(raw, 'answer_perception')
      .structured('s', 'u', z.object({ ok: z.boolean() }));
    expect(
      await db
        .selectFrom('internal_costs')
        .select(['source', 'provider', 'charge', 'cost_microusd'])
        .where('workspace_id', '=', t.workspaceId)
        .orderBy('occurred_at')
        .execute(),
    ).toEqual([
      {
        source: 'platform_call',
        provider: 'tavily',
        charge: 'not_charged',
        cost_microusd: '8000',
      },
      {
        source: 'platform_call',
        provider: 'keenable',
        charge: 'not_charged',
        cost_microusd: '4000',
      },
      {
        source: 'platform_call',
        provider: 'keenable',
        charge: 'not_charged',
        cost_microusd: '0',
      },
      {
        source: 'platform_call',
        provider: 'model_gateway',
        charge: 'included',
        cost_microusd: '8',
      },
    ]);
  });

  it('records a refused Tavily request as a failed call at no cost, then the Keenable fallback at its fee', async () => {
    const t = await fixtures.tenant();
    const search = competitorSearch(
      { TAVILY_API_KEY: 'test-tavily', KEENABLE_API_KEY: 'test-keenable' },
      async (input) =>
        String(input).includes('tavily')
          ? new Response('', { status: 503 })
          : Response.json({ results: [] }),
    );
    await search('buy tool online store', 'en-US', meterFor(db, t.workspaceId));
    expect(
      await db
        .selectFrom('platform_calls')
        .select(['provider', 'status', 'cost_microusd'])
        .where('workspace_id', '=', t.workspaceId)
        .orderBy('created_at')
        .execute(),
    ).toEqual([
      { provider: 'tavily', status: 'failed', cost_microusd: '0' },
      { provider: 'keenable', status: 'settled', cost_microusd: '4000' },
    ]);
  });

  it('writes an uncharged call’s cost row in the caller’s transaction', async () => {
    const t = await fixtures.tenant();
    const search = (trx: typeof db) =>
      meterFor(trx, t.workspaceId).call(
        'commerce_competitor_discovery',
        { provider: 'tavily', model: 'tavily' },
        async () => ({ value: 'results', usage: null }),
      );
    await expect(
      db.transaction().execute(async (trx) => {
        await search(trx);
        throw new Error('caller work failed');
      }),
    ).rejects.toThrow('caller work failed');
    const kept = await db.transaction().execute((trx) => search(trx));
    expect({
      kept,
      recorded: (await calls(t.workspaceId)).map((call) => call.provider),
    }).toEqual({
      kept: 'results',
      recorded: ['tavily'],
    });
  });

  it('fails an uncharged call whose cost row cannot be written', async () => {
    const unknownWorkspace = '00000000-0000-4000-8000-000000000000';
    await expect(
      meterFor(db, unknownWorkspace).call(
        'commerce_competitor_discovery',
        { provider: 'tavily', model: 'tavily' },
        async () => ({ value: 'results', usage: null }),
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'platform_calls_workspace_id_fkey',
    });
  });

  it('refuses included and uncharged calls once the day’s platform spend reaches the ceiling', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const meter = meterFor(db, t.workspaceId);
    const search = vi.fn(async () => ({ value: 'results', usage: null }));
    const tavily = { provider: 'tavily', model: 'tavily' } as const;
    await meter.call('commerce_competitor_discovery', tavily, search);
    const rates = policy.costs.platform;
    const configured = rates.daily_uncharged_ceiling_microusd;
    rates.daily_uncharged_ceiling_microusd = 8000;
    try {
      await expect(meter.call('research_evidence', tavily, search)).rejects.toMatchObject({
        status: 503,
        code: 'platform_spend_paused',
      });
      const { gateway: perception, fetch } = gateway(
        answer('{"ok":true}', { prompt_tokens: 50, completion_tokens: 5 }),
      );
      await expect(
        meter.gateway(perception, 'answer_perception').complete('s', 'u'),
      ).rejects.toMatchObject({ code: 'platform_spend_paused' });
      const { gateway: paid } = gateway(
        answer('{"ok":true}', {
          prompt_tokens: 10_000,
          completion_tokens: 2_000,
        }),
      );
      await meter.gateway(paid, 'prompt_generation').complete('s', 'u');
      expect({
        searches: search.mock.calls.length,
        perceptionRequests: fetch.mock.calls.length,
        recorded: (await calls(t.workspaceId)).map((call) => [call.feature, call.status]),
      }).toEqual({
        searches: 1,
        perceptionRequests: 0,
        recorded: [
          ['commerce_competitor_discovery', 'settled'],
          ['prompt_generation', 'settled'],
        ],
      });
    } finally {
      rates.daily_uncharged_ceiling_microusd = configured;
    }
  });

  it('settles a failed call at no charge when its first settlement transaction errors', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const failing = gateway(() => new Response('unavailable', { status: 503 }));
    const transaction = db.transaction.bind(db);
    const spy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce(transaction)
      .mockImplementationOnce(() => {
        throw new Error('could not serialize access');
      });
    try {
      await expect(
        meterFor(db, t.workspaceId).gateway(failing.gateway, 'project_research').complete('s', 'u'),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 0 });
    expect((await calls(t.workspaceId)).map((call) => [call.status, call.credits])).toEqual([
      ['failed', 0],
    ]);
  });

  it('returns a paid answer when its settlement fails twice, leaving the hold for the sweep', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const { gateway: raw } = gateway(
      answer('{"ok":true}', {
        prompt_tokens: 10_000,
        completion_tokens: 2_000,
      }),
    );
    const transaction = db.transaction.bind(db);
    const refused = () => {
      throw new Error('could not serialize access');
    };
    const spy = vi
      .spyOn(db, 'transaction')
      .mockImplementationOnce(transaction)
      .mockImplementationOnce(refused)
      .mockImplementationOnce(refused);
    try {
      const result = await meterFor(db, t.workspaceId)
        .gateway(raw, 'prompt_generation')
        .structured('s', 'u', z.object({ ok: z.boolean() }));
      expect(result.value).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
    expect((await calls(t.workspaceId)).map((call) => call.status)).toEqual(['reserved']);
    await settleAbandonedCalls(db, new Date(Date.now() + 3_600_000));
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 10 });
  });

  it('refuses a charged call that does not bound its size, before any I/O', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const call = vi.fn(async () => ({ value: null, usage: null }));
    await expect(
      meterFor(db, t.workspaceId).call(
        'prompt_generation',
        { provider: 'model_gateway', model: 'claude-haiku-5-5' },
        call,
      ),
    ).rejects.toThrow('Charged feature prompt_generation must bound its call size');
    expect({
      dispatched: call.mock.calls.length,
      recorded: await calls(t.workspaceId),
    }).toEqual({
      dispatched: 0,
      recorded: [],
    });
  });

  it('sends and holds each charged call at its feature’s output cap, not the gateway maximum', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const held: number[] = [];
    const { gateway: raw, fetch } = gateway(async () => {
      held.push((await spent(t.workspaceId)).held);
      return answer('{"ok":true}', {
        prompt_tokens: 10,
        completion_tokens: 10,
      })();
    });
    const meter = meterFor(db, t.workspaceId);
    await meter.gateway(raw, 'prompt_generation').complete('s', 'u');
    await meter.gateway(raw, 'commerce_buyer_prompts').complete('s', 'u');
    const sentCaps = fetch.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)).max_completion_tokens,
    );
    expect({ held, sentCaps }).toEqual({
      held: [11, 6],
      sentCaps: [16_000, 8_000],
    });
  });

  it('settles a hold a crash left open at the fixed fallback, once', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const { gateway: raw } = gateway(answer('{}', {}));
    const crashed = meterFor(db, t.workspaceId)
      .gateway({ ...raw, complete: () => new Promise(() => {}) }, 'prompt_generation')
      .complete('s', 'u');
    void crashed;
    await vi.waitFor(async () => expect(await calls(t.workspaceId)).toHaveLength(1));
    const later = new Date(Date.now() + 3_600_000);
    await settleAbandonedCalls(db, later);
    await settleAbandonedCalls(db, later);
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 10 });
    expect((await calls(t.workspaceId))[0]).toMatchObject({
      status: 'settled',
      credits: 10,
    });
  });
});
