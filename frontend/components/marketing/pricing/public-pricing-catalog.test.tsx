import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { BillingCatalog } from '@/lib/api/billing';

import { PublicPricingCatalog } from './public-pricing-catalog';

afterEach(() => vi.unstubAllEnvs());

const catalog = {
  catalog_revision: 'revision',
  country_code: null,
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  providers: [],
  addons: [],
  topups: [],
  support_contact: null,
  plans: [
    {
      key: 'tier_1',
      name: 'Starter',
      description: 'Entry plan',
      cadence: 'monthly',
      self_serve: true,
      contact_only: false,
      contact_url: null,
      base_price: { currency: 'USD', amount_minor: 1200 },
      credit_price: null,
      funded_total_price: null,
      checkout_available: true,
      unavailable_reason: null,
      capabilities: [],
      trial_availability: 'unavailable',
      trial_unavailable_reason: null,
      trial_days: null,
    },
  ],
} as BillingCatalog;

describe('public pricing handoff', () => {
  it('renders the catalog price and a bounded app selection without starting checkout', () => {
    render(
      <PublicPricingCatalog catalog={catalog} appOrigin="https://app.citeladder.com" initialByok />,
    );
    expect(screen.getByText('$12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose Starter' })).toHaveAttribute(
      'href',
      'https://app.citeladder.com/pricing?kind=checkout&catalog_key=tier_1&quantity=1&byok=1',
    );
    expect(screen.queryByRole('link', { name: 'Request early access' })).not.toBeInTheDocument();
  });

  it.each(['true', 'false'])(
    'hides paid details while checkout is closed and signup is %s',
    (enabled) => {
      vi.stubEnv('NEXT_PUBLIC_SELF_SERVE_SIGNUP', enabled);
      const unavailable: BillingCatalog = {
        ...catalog,
        plans: [
          {
            ...catalog.plans[0]!,
            checkout_available: false,
            capabilities: [
              {
                key: 'ai_credits',
                value: 50,
                capability_type: 'counter.consumable',
                issuable: true,
              },
              { key: 'fanout', value: true, capability_type: 'flag', issuable: true },
              { key: 'provider.grok', value: null, capability_type: 'flag', issuable: false },
              { key: 'provider.perplexity', value: null, capability_type: 'flag', issuable: false },
              { key: 'provider.copilot', value: null, capability_type: 'flag', issuable: false },
            ],
          },
        ],
        addons: [
          {
            key: 'extra_prompts',
            name: 'Extra prompts',
            description: 'More prompts',
            unit_price: { currency: 'USD', amount_minor: 500 },
            availability: 'unavailable',
            quantity_min: 1,
            quantity_max: 5,
            eligible_plan_keys: ['tier_1'],
            expiry_days: 30,
            grants_per_unit: [],
            unavailable_reason: 'checkout_unavailable',
          },
        ],
      };
      render(
        <PublicPricingCatalog
          catalog={unavailable}
          appOrigin="https://app.citeladder.com"
          initialByok
        />,
      );
      expect(
        screen.getByRole('link', {
          name: enabled === 'true' ? 'Start free trial' : 'Request early access',
        }),
      ).toHaveAttribute(
        'href',
        enabled === 'true' ? 'https://app.citeladder.com/register' : '/contact',
      );
      expect(screen.queryByRole('link', { name: /^Choose / })).not.toBeInTheDocument();
      expect(screen.queryByText('$12')).not.toBeInTheDocument();
      for (const name of ['Plans', 'Plan comparison', 'Add-ons and top-ups']) {
        expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();
      }
    },
  );
});

describe('public pricing display region', () => {
  it('labels INR prices as exclusive of GST', () => {
    render(
      <PublicPricingCatalog
        catalog={{
          ...catalog,
          country_code: 'IN',
          region: 'india',
          currency: 'INR',
          plans: [{ ...catalog.plans[0]!, base_price: { currency: 'INR', amount_minor: 449900 } }],
        }}
        appOrigin="https://app.citeladder.com"
        initialByok
      />,
    );
    expect(screen.getByText(/per month · excl\. GST/)).toBeInTheDocument();
  });
});
