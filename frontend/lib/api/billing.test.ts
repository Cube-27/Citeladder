import { afterEach, describe, expect, it, vi } from 'vitest';

import { billingApi } from './billing';

const SUMMARY = {
  billing_account_id: '11111111-1111-4111-8111-111111111111',
  billing_country: 'IN',
  country_verification: 'provisional',
  tier_key: 'free',
  subscription_status: null,
  current_period_end: null,
  cancel_at_period_end: false,
  paid_through: null,
  grace_until: null,
  can_checkout: false,
  checkout_block_reason: 'checkout_not_enabled',
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('billing API contract', () => {
  it('uses same-origin routes and never submits amount, currency, country, or plan id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ checkout_url: 'https://rzp.io/i/test', expires_at: '2026-07-26T12:00:00Z' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await billingApi.checkout('checkout-idempotency-key');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/billing/checkout');
    expect(JSON.parse(String(init.body))).toEqual({ tier_key: 'paid', cadence: 'monthly' });
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('checkout-idempotency-key');
  });

  it('strips leaked provider fields from a billing summary (tolerant-on-unknown)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ ...SUMMARY, razorpay_plan_id: 'plan' })),
    );
    // Additive provider fields must never break the UI — they are stripped
    // from the parsed output, so the leak never reaches app state.
    const summary = await billingApi.me();
    expect('razorpay_plan_id' in summary).toBe(false);
  });
});
