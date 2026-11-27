import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';

import { billingCatalogSchema, billingEntitlementSchema } from '@citeladder/contracts/billing';

import { ExtraPurchases } from './extra-purchases';

const EMPTY_CATALOG = billingCatalogSchema.parse({
  catalog_revision: 'commercial-v9',
  country_code: 'US',
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [],
  addons: [],
  topups: [],
  support_contact: null,
  providers: [],
});

const ENTITLEMENT = billingEntitlementSchema.parse({
  billing_account_id: '11111111-1111-4111-8111-111111111111',
  status: 'resolved',
  errors: [],
  registry_revision: 'registry-v8',
  entitlement_lifecycle_version: 1,
  resolved_at: '2026-08-01T00:00:00Z',
  valid_until: null,
  subscription: null,
  trial_grant: null,
  capabilities: [],
  grants: [
    {
      grant_id: '22222222-2222-4222-8222-222222222222',
      source_kind: 'addon',
      key: 'project_slots',
      value: 2,
      valid_from: '2026-08-01T00:00:00Z',
      effective_valid_until: null,
      revoked_at: null,
      catalog_revision: 'commercial-v9',
    },
    {
      grant_id: '33333333-3333-4333-8333-333333333333',
      source_kind: 'topup',
      key: 'project_slots',
      value: 5,
      valid_from: '2026-06-01T00:00:00Z',
      effective_valid_until: '2026-07-01T00:00:00Z',
      revoked_at: null,
      catalog_revision: 'commercial-v9',
    },
    {
      grant_id: '44444444-4444-4444-8444-444444444444',
      source_kind: 'addon',
      key: 'project_slots',
      value: 7,
      valid_from: '2026-07-01T00:00:00Z',
      effective_valid_until: null,
      revoked_at: '2026-09-01T00:00:00Z',
      catalog_revision: 'commercial-v9',
    },
  ],
});

describe('ExtraPurchases', () => {
  it('keeps active purchases visible when the catalogue offers nothing to buy', () => {
    render(
      <ExtraPurchases
        catalog={EMPTY_CATALOG}
        planKey="tier_1"
        entitlement={ENTITLEMENT}
        disabled={false}
        onBuy={() => undefined}
      />,
    );
    const active = screen.getByRole('region', { name: 'Active purchases' });
    expect(within(active).getByText('+2 projects')).toBeVisible();
    expect(within(active).getByText('+7 projects')).toBeVisible();
    expect(within(active).queryByText('+5 projects')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
  });

  const extra = (key: string, name: string, reason: string | null) => ({
    key,
    name,
    description: '',
    unit_price: reason ? null : { currency: 'USD', amount_minor: 1900 },
    quantity_min: 1,
    quantity_max: 20,
    availability: reason ? 'unavailable' : 'available',
    unavailable_reason: reason,
    grants_per_unit: [{ key: 'project_slots', value: 1 }],
    eligible_plan_keys: ['tier_1'],
    expiry_days: 30,
  });
  const gatedCatalog = (addons: unknown[]) =>
    billingCatalogSchema.parse({ ...EMPTY_CATALOG, addons });
  const CLOSED = 'Checkout unavailable';

  it('says a reason every extra shares once for the group and nothing under each row', () => {
    const bought: string[] = [];
    render(
      <ExtraPurchases
        catalog={gatedCatalog([
          extra('a', 'Seats', 'checkout_unavailable'),
          extra('b', 'Markets', 'checkout_unavailable'),
        ])}
        planKey="tier_1"
        entitlement={null}
        disabled={false}
        onBuy={(_kind, key) => bought.push(key)}
      />,
    );
    const seats = screen.getByRole('button', { name: 'Buy Seats' });
    const markets = screen.getByRole('button', { name: 'Buy Markets' });
    expect(screen.getAllByText(CLOSED)).toHaveLength(1);
    expect(seats.closest('[data-setting-row]')).not.toHaveTextContent(CLOSED);
    expect(seats).toHaveAttribute('aria-disabled', 'true');
    expect(markets).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(seats);
    fireEvent.click(markets);
    expect(bought).toEqual([]);
  });

  it('says the reason under the one gated Buy and keeps the others buyable', () => {
    const bought: string[] = [];
    render(
      <ExtraPurchases
        catalog={gatedCatalog([
          extra('a', 'Seats', 'checkout_unavailable'),
          extra('b', 'Markets', null),
        ])}
        planKey="tier_1"
        entitlement={null}
        disabled={false}
        onBuy={(_kind, key) => bought.push(key)}
      />,
    );
    const seats = screen.getByRole('button', { name: 'Buy Seats' });
    seats.focus();
    expect(seats).toHaveFocus();
    expect(seats).toHaveAttribute('aria-disabled', 'true');
    expect(seats).toHaveAccessibleDescription(CLOSED);
    expect(seats.closest('[data-setting-row]')).toHaveTextContent(CLOSED);
    const markets = screen.getByRole('button', { name: 'Buy Markets' });
    expect(markets).toHaveAccessibleDescription('');
    fireEvent.click(seats);
    fireEvent.click(markets);
    expect(bought).toEqual(['b']);
  });
});
