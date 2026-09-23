import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { PENDING_PRICING_INTENT_KEY } from '@/lib/config/billing';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import PricingRoute from './pricing-route';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const catalog = {
  catalog_revision: 'commercial-v9',
  country_code: null,
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [],
  addons: [
    {
      key: 'addon_seats',
      name: 'Extra seats',
      description: 'More seats',
      cadence: 'monthly',
      unit_price: { currency: 'USD', amount_minor: 1900 },
      quantity_min: 1,
      quantity_max: 20,
      availability: 'available',
      unavailable_reason: null,
      grant_key: 'seats',
      grant_value_per_unit: 1,
    },
  ],
  topups: [],
  providers: [],
};

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  globalThis.sessionStorage.clear();
});
afterAll(() => mswServer.close());

describe('app pricing continuation', () => {
  it('waits for confirmation, refreshes the catalog, and scopes the mutation to the selected workspace', async () => {
    const writes: Array<{ workspace: string | null; key: string | null }> = [];
    let reads = 0;
    mswServer.use(
      http.get('/api/v1/billing/catalog', () => {
        reads += 1;
        return HttpResponse.json(catalog);
      }),
      http.post('/api/v1/billing/addons', ({ request }) => {
        writes.push({
          workspace: request.headers.get('X-Workspace-Id'),
          key: request.headers.get('Idempotency-Key'),
        });
        return HttpResponse.json({ detail: 'unavailable' }, { status: 503 });
      }),
    );
    globalThis.sessionStorage.setItem(
      PENDING_PRICING_INTENT_KEY,
      JSON.stringify({
        version: 1,
        kind: 'addon',
        catalog_key: 'addon_seats',
        quantity: 2,
        byok: true,
        country_code: null,
        billing_details: null,
        idempotency_key: 'captured-key',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );

    renderWithProviders(<PricingRoute />);
    expect(await screen.findByRole('heading', { name: 'Extra seats' })).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(reads).toBeGreaterThan(1);
    expect(writes[0]).toEqual({ workspace: workspaceId, key: 'captured-key' });
  });

  it('shows the server quote before opening payment checkout', async () => {
    let created = 0;
    let opened = 0;
    const money = (amount_minor: number) => ({ currency: 'USD', amount_minor });
    const quote = {
      quote_id: 'q1',
      catalog_revision: 'commercial-v9',
      catalog_key: 'tier_1',
      credential_mode: 'byok',
      country_code: 'US',
      region: 'international',
      base_price: money(4900),
      subtotal_price: money(4900),
      discount: money(0),
      taxable_value: money(4900),
      credit_price: null,
      tax: money(0),
      tax_treatment: 'EXPORT_ZERO_RATED',
      tax_rate: '0',
      cgst: money(0),
      sgst: money(0),
      igst: money(0),
      tax_policy_version: 1,
      total_price: money(4900),
      expires_at: '2026-12-01T12:00:00Z',
    };
    const planCatalog = {
      ...catalog,
      plans: [
        {
          key: 'tier_1',
          name: 'Starter',
          description: 'Starter plan',
          cadence: 'monthly',
          self_serve: true,
          contact_only: false,
          contact_url: null,
          base_price: money(4900),
          credit_price: null,
          funded_total_price: null,
          checkout_available: true,
          unavailable_reason: 'funded_not_priced',
          capabilities: [],
          trial_availability: 'unavailable',
          trial_unavailable_reason: 'trial_unavailable',
          trial_days: null,
        },
      ],
    };
    mswServer.use(
      http.get('/api/v1/billing/catalog', () => HttpResponse.json(planCatalog)),
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'test.user@example.test',
            role: 'user',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }),
      ),
      http.post('/api/v1/billing/subscriptions', () => {
        created += 1;
        return HttpResponse.json({
          activation_id: '11111111-1111-4111-8111-111111111111',
          kind: 'base',
          catalog_key: 'tier_1',
          quantity: 1,
          status: 'pending',
          quote,
          checkout_url: null,
          expires_at: '2026-12-01T12:00:00Z',
          failure_code: null,
        });
      }),
      http.get('/api/v1/billing/activations/11111111-1111-4111-8111-111111111111', () =>
        HttpResponse.json({
          activation_id: '11111111-1111-4111-8111-111111111111',
          kind: 'base',
          catalog_key: 'tier_1',
          quantity: 1,
          status: 'pending',
          quote,
          checkout_url: null,
          expires_at: '2026-12-01T12:00:00Z',
          failure_code: null,
        }),
      ),
      http.get(
        '/api/v1/billing/subscriptions/11111111-1111-4111-8111-111111111111/checkout',
        () => {
          opened += 1;
          return HttpResponse.json({ detail: 'unavailable' }, { status: 503 });
        },
      ),
    );
    globalThis.sessionStorage.setItem(
      PENDING_PRICING_INTENT_KEY,
      JSON.stringify({
        version: 1,
        kind: 'checkout',
        catalog_key: 'tier_1',
        quantity: 1,
        byok: true,
        country_code: null,
        billing_details: null,
        idempotency_key: 'quote-key',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );
    renderWithProviders(<PricingRoute />);
    await screen.findByRole('heading', { name: 'Starter' });
    expect(created).toBe(0);
    await userEvent.type(screen.getByRole('textbox', { name: /Billing country/ }), 'US');
    await userEvent.type(screen.getByRole('textbox', { name: 'Billing name' }), 'CiteLadder');
    await userEvent.type(screen.getByRole('textbox', { name: 'Address' }), '1 Main Street');
    await userEvent.type(screen.getByRole('textbox', { name: 'City' }), 'New York');
    await userEvent.type(screen.getByRole('textbox', { name: 'Postal code' }), '10001');
    await userEvent.click(screen.getByRole('checkbox', { name: /export of service/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Review current quote' }));
    expect(await screen.findByRole('region', { name: 'Current quote' })).toBeInTheDocument();
    expect(created).toBe(1);
    expect(opened).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and continue to payment' }));
    await waitFor(() => expect(opened).toBe(1));
  });
});
