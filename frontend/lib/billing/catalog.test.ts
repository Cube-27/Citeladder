import { describe, expect, it } from 'vite-plus/test';

import type { BillingCatalog, CatalogPlan } from '@/lib/api/billing';

import {
  checkoutSelection,
  comparisonRows,
  formatMoney,
  headlinePrice,
  isPurchasable,
} from './catalog';

function plan(overrides: Partial<CatalogPlan> = {}): CatalogPlan {
  return {
    key: 'tier_1',
    name: 'Starter',
    description: 'Entry plan',
    cadence: 'monthly',
    self_serve: true,
    contact_only: false,
    contact_url: null,
    base_price: { currency: 'USD', amount_minor: 4900 },
    funded_total_price: null,
    checkout_available: true,
    funded_checkout_available: false,
    unavailable_reason: null,
    capabilities: [],
    trial_availability: 'unavailable',
    trial_unavailable_reason: 'trial_unavailable',
    trial_days: null,
    ...overrides,
  } as CatalogPlan;
}

function catalog(overrides: Partial<BillingCatalog> = {}): BillingCatalog {
  return {
    catalog_revision: 'commercial-v9',
    country_code: 'US',
    region: 'international',
    currency: 'USD',
    currency_minor_units: 2,
    plans: [plan()],
    addons: [],
    topups: [],
    support_contact: null,
    providers: [],
    ...overrides,
  } as BillingCatalog;
}

describe('headlinePrice', () => {
  it('resolves BYOK from base_price', () => {
    expect(headlinePrice(plan(), 'byok')).toEqual({
      kind: 'price',
      money: { currency: 'USD', amount_minor: 4900 },
    });
  });

  it('returns unavailable — never zero — when the managed price is null', () => {
    const result = headlinePrice(plan({ unavailable_reason: 'funded_not_priced' }), 'funded');
    expect(result).toEqual({ kind: 'unavailable', reason: 'funded_not_priced' });
  });

  it('returns contact for a contact-only plan in either mode', () => {
    const contact = plan({ key: 'enterprise', contact_only: true, base_price: null });
    expect(headlinePrice(contact, 'byok')).toEqual({ kind: 'contact' });
    expect(headlinePrice(contact, 'funded')).toEqual({ kind: 'contact' });
  });
});

describe('checkoutSelection', () => {
  it('accepts an available BYOK self-serve plan', () => {
    expect(checkoutSelection(plan(), 'byok')).toEqual({
      ok: true,
      catalog_key: 'tier_1',
      credential_mode: 'byok',
    });
  });

  it('offers managed checkout only when the catalog marks managed purchasable', () => {
    expect(checkoutSelection(plan(), 'funded').ok).toBe(false);
    expect(checkoutSelection(plan({ funded_checkout_available: true }), 'funded')).toEqual({
      ok: true,
      catalog_key: 'tier_1',
      credential_mode: 'funded',
    });
  });

  it('refuses a contact-only plan', () => {
    expect(checkoutSelection(plan({ key: 'enterprise', contact_only: true }), 'byok').ok).toBe(
      false,
    );
  });

  it('refuses a plan the catalog marks unpurchasable', () => {
    expect(checkoutSelection(plan({ checkout_available: false }), 'byok').ok).toBe(false);
  });
});

describe('comparisonRows', () => {
  it('derives rows from the union of published capability keys', () => {
    const rows = comparisonRows(
      catalog({
        plans: [
          plan({
            key: 'tier_1',
            capabilities: [
              {
                key: 'project_slots',
                capability_type: 'counter.occupancy',
                value: 1,
                issuable: true,
              },
            ],
          }),
          plan({
            key: 'tier_2',
            capabilities: [
              {
                key: 'project_slots',
                capability_type: 'counter.occupancy',
                value: 5,
                issuable: true,
              },
              { key: 'crawl_logs', capability_type: 'flag', value: true, issuable: true },
            ],
          }),
        ],
      }),
    );

    expect(rows.map((row) => row.key)).toEqual(['project_slots', 'crawl_logs']);
    expect(rows[0]?.values.tier_2?.value).toBe(5);
    expect(rows[1]!.values.tier_1).toBeUndefined();
  });
});

describe('isPurchasable', () => {
  it('rejects an available-but-unpriced entry', () => {
    expect(
      isPurchasable({
        key: 'topup_bench',
        name: 'AI credits',
        description: '',
        unit_price: null,
        quantity_min: 1,
        quantity_max: 10,
        availability: 'available',
        unavailable_reason: null,
        grants_per_unit: [{ key: 'ai_credits', value: 1 }],
        eligible_plan_keys: ['tier_1'],
        expiry_days: 30,
      }),
    ).toBe(false);
  });
});

describe('formatMoney', () => {
  it('uses the catalog currency and minor units, with no price constants', () => {
    expect(formatMoney({ currency: 'USD', amount_minor: 4900 }, 2)).toBe('$49');
    expect(formatMoney({ currency: 'INR', amount_minor: 499900 }, 2)).toContain('4,999');
  });
  it('groups in one fixed locale, so server render and hydration agree', () => {
    expect(formatMoney({ currency: 'INR', amount_minor: 44990000 }, 2)).toBe('₹449,900');
    expect(formatMoney({ currency: 'USD', amount_minor: 1234567 }, 2)).toBe('$12,345.67');
  });
});
