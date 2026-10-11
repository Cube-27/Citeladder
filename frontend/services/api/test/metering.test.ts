import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { createJevClient, jevSettings } from '../src/models/jev.ts';
import { UnmeteredCallError } from '../src/models/meter-scope.ts';
import { meterFor, settleAbandonedCalls } from '../src/billing/metering.ts';
import { chargeCredits, modelPrice } from '../src/billing/ai-pricing.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

/** A platform gateway on the priced model whose provider answers with `usage`. */
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
        // Large enough that each hold (about 65 credits) bounds the usage below.
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
  return { held: total('reservation') - total('release'), debited: total('debit') };
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
    // 10k input and 2k output tokens cost $0.002; marked up and rounded: 3 credits.
    expect(chargeCredits(haiku, { input_tokens: 10_000, output_tokens: 2_000 })).toBe(3);
    expect(chargeCredits(haiku, { input_tokens: 10, output_tokens: null })).toBeNull();
    expect(
      chargeCredits(haiku, { input_tokens: 5, cached_input_tokens: 6, output_tokens: 1 }),
    ).toBeNull();
    // An unpriced model has no price, except the configured gateway model at the default rate.
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
      return answer('{"ok":true}', { prompt_tokens: 10_000, completion_tokens: 2_000 })();
    });
    const metered = meterFor(db, t.workspaceId).gateway(raw, 'prompt_generation');
    await metered.structured('s', 'u', z.object({ ok: z.boolean() }));
    // The hold was committed before the provider was reached.
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
      // The provider answered and was paid; the caller could not parse the answer.
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

  it('settles a hold a crash left open at the fixed fallback, once', async () => {
    const t = await fixtures.tenant();
    await credited(t, 100);
    const { gateway: raw } = gateway(answer('{}', {}));
    const crashed = meterFor(db, t.workspaceId)
      .gateway({ ...raw, complete: () => new Promise(() => {}) }, 'commerce_buyer_prompts')
      .complete('s', 'u');
    void crashed;
    await vi.waitFor(async () => expect((await calls(t.workspaceId)).length).toBe(1));
    const later = new Date(Date.now() + 3_600_000);
    await settleAbandonedCalls(db, later);
    await settleAbandonedCalls(db, later);
    expect(await spent(t.workspaceId)).toEqual({ held: 0, debited: 10 });
    expect((await calls(t.workspaceId))[0]).toMatchObject({ status: 'settled', credits: 10 });
  });
});
