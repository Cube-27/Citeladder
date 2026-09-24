import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import type { BillingCatalog } from '@/lib/api/billing';

import { PublicPricingCatalog } from './public-pricing-catalog';

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
  });
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
