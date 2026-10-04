import { expect, it } from 'vitest';
import { mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inrMinor,
  taxMinor,
  launchCatalog,
  validateCatalog,
} from '../src/billing/catalog-authoring.ts';
import { billingSettings, razorpaySettings } from '../src/billing/config.ts';
import {
  bindPlanRefs,
  recurringPrices,
  verifyPlan,
  RazorpayPlanReader,
  workspacePath,
  readOperatorJson,
  writeBoundCatalog,
} from '../src/billing/plan-operators.ts';
import { chargeCredits } from '../src/billing/ai-credits.ts';
import { redact } from '../src/billing/admin.ts';
import storedCatalog from './billing-catalog.fixture.json' with { type: 'json' };
import { catalogDigest } from '../src/billing/catalog-authoring.ts';

it('preserves the Python catalog checksum for supplementary Unicode', () => {
  const payload = structuredClone(storedCatalog);
  payload.plans[0]!.description = 'Unicode 😀';
  // hashlib.sha256(json.dumps(validated_payload, sort_keys=True,
  // separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
  expect(catalogDigest(validateCatalog(payload))).toBe(
    'b992b6089a1fe03e793b03697db12a01e5fc470c0bbf01bf368a4985b1a92493',
  );
});

it('normalizes seller configuration and rejects malformed invoice identity', () => {
  expect(
    billingSettings({
      BILLING_SELLER_EMAIL: ' billing+india@example.test ',
      BILLING_INVOICE_PREFIX: ' cl ',
    }).seller,
  ).toMatchObject({ email: 'billing+india@example.test', invoice_prefix: 'CL' });
  for (const email of [
    'billing@example',
    'billing@example..test',
    'billing@example.test.',
    'billing @example.test',
    'billing@example.test@other.test',
  ])
    expect(() => billingSettings({ BILLING_SELLER_EMAIL: email })).toThrow('email address');
  expect(() => billingSettings({ BILLING_INVOICE_PREFIX: 'LONG' })).toThrow('invoice_prefix');
});

it.each([
  [4900, 449900],
  [9900, 899900],
  [19900, 1799900],
  [24900, 2249900],
  [49900, 4499900],
  [1500, 139900],
  [1900, 179900],
  [2500, 229900],
])('freezes USD %i to INR %i using exact ceiling', (usd, inr) => {
  expect(inrMinor(usd!, '90')).toBe(inr);
});
it('rounds GST half up at the minor-unit boundary and rejects untrusted rates', () => {
  expect(taxMinor(101, '0.5')).toBe(51);
  expect(inrMinor(100, '100.00000000000000000000000001')).toBe(19900);
  for (const rate of ['NaN', 'Infinity', '-1', '0', '1e9'])
    expect(() => inrMinor(4900, rate)).toThrow();
  expect(() => taxMinor(100, '1.01')).toThrow();
});
it('authors checkout regions only for named modes and approved India tax', () => {
  expect(
    launchCatalog({ mode: null, settings: billingSettings({}) }).plans.every(
      (p) => !Object.keys(p.regional_byok_prices).length,
    ),
  ).toBe(true);
  const unapproved = launchCatalog({ mode: 'test', settings: billingSettings({}) });
  expect(Object.keys(unapproved.plans[0]!.regional_byok_prices)).toEqual(['international']);
  const approved = launchCatalog({
    mode: 'test',
    settings: billingSettings({
      BILLING_INDIA_GST_RATE: '0.18',
      BILLING_INDIA_GST_APPROVAL_REFERENCE: 'CA-1',
    }),
  });
  expect(approved.plans[0]!.regional_byok_prices.india).toMatchObject({
    amount_minor: 449900,
    tax_minor: 80982,
    tax_verified: true,
    provider_price_ref: '',
  });
  expect(approved.campaign.enabled).toBe(false);
});
it.each([
  (p: ReturnType<typeof launchCatalog>) => p.plans[0]!.grants.push({ key: 'unknown', value: 1 }),
  (p: ReturnType<typeof launchCatalog>) =>
    p.plans[0]!.grants.push({ key: 'provider.copilot', value: 1 }),
  (p: ReturnType<typeof launchCatalog>) => p.plans[0]!.grants.push({ key: 'agent', value: 1 }),
  (p: ReturnType<typeof launchCatalog>) => {
    p.plans[1]!.grants = p.plans[1]!.grants.filter((g) => g.key !== 'agent');
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.plans[0]!.funded_price!.amount_minor = 1;
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.plans[0]!.regional_byok_prices.international!.tax_minor = 1;
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.addons[0]!.modes.byok!.regional_prices.india!.amount_minor = 100;
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.topups[0]!.modes.byok!.grants = [{ key: 'project_slots', value: 1 }];
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.topups[0]!.key = p.addons[0]!.key;
  },
  (p: ReturnType<typeof launchCatalog>) => {
    p.campaign.enabled = true;
  },
])('refuses inconsistent authored commercial terms %#', (mutate) => {
  const payload = launchCatalog({ mode: 'test', settings: billingSettings({}) });
  mutate(payload);
  expect(() => validateCatalog(payload)).toThrow();
});
it('bounds AI policy and refuses secret-shaped platform metadata', () => {
  const payload = launchCatalog({ mode: null, settings: billingSettings({}) });
  const rate = {
    feature: 'agent' as const,
    model: 'fixture',
    input_credits_per_million: 100,
    cached_input_credits_per_million: 25,
    output_credits_per_million: 300,
    reasoning_credits_per_million: 300,
    call_credit_cap: 50,
    unknown_usage_charge: 10,
  };
  payload.ai_credit_policy = { version: 'verified-v1', rates: [rate] };
  validateCatalog(payload);
  expect(chargeCredits(rate, { input_tokens: 1000000, output_tokens: 0 })).toBe(50);
  expect(chargeCredits(rate, {})).toBeNull();
  rate.unknown_usage_charge = 51;
  expect(() => validateCatalog(payload)).toThrow();
  payload.ai_credit_policy = null;
  expect(() =>
    validateCatalog({
      ...payload,
      platform_routes: [
        {
          logical_engine: 'chatgpt',
          transport_provider: 'openai',
          model: 'fixture',
          api_key: 'no',
        },
      ],
    }),
  ).toThrow();
  expect(redact({ api_key: 'value', nested: { credential: 'value' }, account_id: 'safe' })).toEqual(
    { api_key: '[REDACTED]', nested: { credential: '[REDACTED]' }, account_id: 'safe' },
  );
});
it('binds every recurring SKU once into a copy and checks exact provider evidence', () => {
  const payload = launchCatalog({ mode: 'test', settings: billingSettings({}) });
  const refs = Object.fromEntries(
    recurringPrices(payload).map(({ key }, i) => [key, `plan_${i}abc`]),
  );
  const bound = bindPlanRefs(payload, refs);
  expect(recurringPrices(bound).map(({ price }) => price.provider_price_ref)).toEqual(
    Object.values(refs),
  );
  expect(recurringPrices(payload).every(({ price }) => !price.provider_price_ref)).toBe(true);
  expect(() => bindPlanRefs(payload, { ...refs, unknown: 'plan_extra' })).toThrow();
  expect(() =>
    bindPlanRefs(payload, Object.fromEntries(Object.keys(refs).map((key) => [key, 'plan_shared']))),
  ).toThrow();
  const price = recurringPrices(bound)[0]!.price;
  const actual = {
    id: price.provider_price_ref,
    item: {
      name: price.provider_plan_name,
      amount: price.amount_minor + price.tax_minor,
      currency: price.currency,
    },
    interval: 1,
    period: 'monthly',
  };
  verifyPlan(actual, price);
  expect(() => verifyPlan({ ...actual, interval: true }, price)).toThrow();
  expect(() =>
    verifyPlan({ ...actual, item: { ...actual.item, amount: actual.item.amount + 1 } }, price),
  ).toThrow();
});
it('uses only fixed-origin GETs with redirects disabled and bounded response bodies', async () => {
  const requests: [string, RequestInit][] = [];
  const adapter = razorpaySettings({
    APP_ENV: 'test',
    BILLING_RAZORPAY_MODE: 'test',
    BILLING_RAZORPAY_KEY_ID: 'rzp_test_fixture',
    BILLING_RAZORPAY_KEY_SECRET: 'fixture',
  });
  const transport: typeof fetch = async (url, init) => {
    requests.push([String(url), init!]);
    return new Response(JSON.stringify({ id: 'plan_fixture' }));
  };
  const reader = new RazorpayPlanReader(billingSettings({}), adapter, transport);
  await reader.fetchPlan('plan_fixture');
  expect(requests[0]).toMatchObject([
    'https://api.razorpay.com/v1/plans/plan_fixture',
    { method: 'GET', redirect: 'error' },
  ]);
  await expect(reader.fetchPlan('https://other.example')).rejects.toThrow();
  await expect(
    new RazorpayPlanReader(
      billingSettings({}),
      adapter,
      async () => new Response('', { status: 302 }),
    ).fetchPlan('plan_fixture'),
  ).rejects.toThrow();
  await expect(
    new RazorpayPlanReader(
      billingSettings({}),
      adapter,
      async () => new Response('x'.repeat(1048577)),
    ).fetchPlan('plan_fixture'),
  ).rejects.toThrow('too_large');
  expect(
    () =>
      new RazorpayPlanReader(
        billingSettings({}),
        { ...adapter, origin: 'https://other.example' },
        transport,
      ),
  ).toThrow();
  expect(
    () => new RazorpayPlanReader(billingSettings({}), { ...adapter, production: true }, transport),
  ).toThrow();
});
it('contains existing and new output paths, including symlink escapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-path-'));
  const previous = process.cwd();
  await mkdir(join(root, 'inside'));
  await mkdir(join(root, 'outside'));
  await mkdir(join(root, 'inside', '.runtime'));
  await writeFile(join(root, 'inside', '.runtime', 'catalog.json'), '{"revision":"fixture"}');
  await writeFile(join(root, 'outside', 'catalog.json'), '{"secret":"fixture-private"}');
  await symlink(
    join(root, 'outside'),
    join(root, 'inside', 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  process.chdir(join(root, 'inside'));
  try {
    await expect(readOperatorJson('.runtime/catalog.json')).resolves.toEqual({
      revision: 'fixture',
    });
    await expect(
      readOperatorJson(join(root, 'inside', '.runtime', 'catalog.json')),
    ).resolves.toEqual({ revision: 'fixture' });
    await expect(readOperatorJson('../outside/catalog.json')).rejects.toThrow(
      'path_outside_workspace',
    );
    await expect(readOperatorJson(join(root, 'outside', 'catalog.json'))).rejects.toThrow(
      'path_outside_workspace',
    );
    await expect(readOperatorJson('escape/catalog.json')).rejects.toThrow('path_outside_workspace');
    await expect(
      writeBoundCatalog(
        'escape/new.json',
        launchCatalog({ mode: null, settings: billingSettings({}) }),
      ),
    ).rejects.toThrow('path_outside_workspace');
    await expect(workspacePath('new.json', true)).resolves.toBe(join(root, 'inside', 'new.json'));
    await expect(workspacePath('../outside/new.json', true)).rejects.toThrow('outside_workspace');
    await expect(workspacePath('escape/new.json', true)).rejects.toThrow('outside_workspace');
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});
