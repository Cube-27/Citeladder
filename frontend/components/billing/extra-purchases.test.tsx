import { render, screen, within } from '@testing-library/react';
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
    expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
  });
});
