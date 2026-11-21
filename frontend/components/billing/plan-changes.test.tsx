import { describe, expect, it } from 'vite-plus/test';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test/render';
import type { BillingCatalog, BillingEntitlement, CatalogPlan } from '@/lib/api/billing';

import { PlanChanges } from './plan-changes';

const usd = (amount_minor: number): CatalogPlan['base_price'] => ({
  currency: 'USD',
  amount_minor,
});

const STARTER = {
  key: 'tier_1',
  name: 'Starter',
  description: 'Entry plan',
  cadence: 'monthly',
  self_serve: true,
  contact_only: false,
  contact_url: null,
  base_price: usd(4900),
  funded_total_price: usd(9900),
  checkout_available: true,
  funded_checkout_available: true,
  unavailable_reason: null,
  capabilities: [],
  trial_availability: 'unavailable',
  trial_unavailable_reason: 'trial_unavailable',
  trial_days: null,
} satisfies CatalogPlan;

const GROWTH = {
  ...STARTER,
  key: 'tier_2',
  name: 'Growth',
  base_price: usd(9900),
  funded_total_price: usd(19900),
  funded_checkout_available: false,
} satisfies CatalogPlan;

const CATALOG = {
  catalog_revision: 'commercial-v9',
  country_code: 'US',
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [STARTER, GROWTH],
  addons: [],
  topups: [],
  support_contact: null,
  providers: [],
} satisfies BillingCatalog;

describe('PlanChanges', () => {
  it.each([
    { mode: 'byok', price: '$99 / month before tax', upgradable: true },
    { mode: 'funded', price: '$199 / month before tax', upgradable: false },
  ] as const)(
    "prices and gates an upgrade in the subscription's own mode: $mode",
    ({ mode, price, upgradable }) => {
      const subscription = {
        catalog_key: 'tier_1',
        credential_mode: mode,
        status: 'active',
        current_period_end: '2026-09-01T00:00:00Z',
        cancel_at_period_end: false,
        resumable_until: null,
        scheduled_change: null,
      } satisfies NonNullable<BillingEntitlement['subscription']>;
      const noop = () => undefined;
      renderWithProviders(
        <PlanChanges
          catalog={CATALOG}
          currentPlan={STARTER}
          subscription={subscription}
          canManage
          controls={{ upgrade: noop, downgrade: noop, pending: false, downgradeError: null }}
        />,
      );

      expect({
        price: screen.queryByText(price) !== null,
        enabled: !screen
          .getByRole('button', { name: 'Upgrade to Growth' })
          .hasAttribute('disabled'),
        closed: screen.queryByText('Upgrades unavailable: checkout is closed.') !== null,
      }).toEqual({ price: true, enabled: upgradable, closed: !upgradable });
    },
  );
});
