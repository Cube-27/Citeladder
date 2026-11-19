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
      unit_price: { currency: 'USD', amount_minor: 1900 },
      quantity_min: 1,
      quantity_max: 20,
      availability: 'available',
      unavailable_reason: null,
      grants_per_unit: [{ key: 'project_slots', value: 1 }],
      eligible_plan_keys: ['tier_1', 'tier_2', 'tier_3'],
      expiry_days: 30,
    },
  ],
  topups: [],
  support_contact: null,
  providers: [],
};

const PLAN = {
  key: 'tier_1',
  name: 'Starter',
  description: 'Starter plan',
  cadence: 'monthly',
  self_serve: true,
  contact_only: false,
  contact_url: null,
  base_price: { currency: 'USD', amount_minor: 4900 },
  funded_total_price: null,
  checkout_available: true,
  funded_checkout_available: false,
  unavailable_reason: 'funded_not_priced',
  capabilities: [],
  trial_availability: 'unavailable',
  trial_unavailable_reason: 'trial_unavailable',
  trial_days: null,
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  globalThis.sessionStorage.clear();
});
afterAll(() => mswServer.close());

const signedInUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'test.user@example.test',
  role: 'user',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function entitlement(subscription: unknown) {
  return {
    billing_account_id: '11111111-1111-4111-8111-111111111111',
    status: 'resolved',
    errors: [],
    registry_revision: 'registry-v8',
    entitlement_lifecycle_version: 1,
    resolved_at: '2026-08-01T00:00:00Z',
    valid_until: null,
    subscription,
    trial_grant: null,
    capabilities: [],
    grants: [],
  };
}

const scaleSubscription = {
  catalog_key: 'tier_3',
  status: 'active',
  current_period_end: '2026-09-01T00:00:00Z',
  cancel_at_period_end: false,
  resumable_until: null,
  scheduled_change: null,
};

describe('app pricing continuation', () => {
  it.each([
    [null, 'Choose a plan', 'Test Workspace has no plan yet.'],
    [scaleSubscription, 'Change plan', 'Test Workspace is on Scale.'],
    // An ended plan is neither the current plan nor "no plan yet".
    [{ ...scaleSubscription, status: 'expired' }, 'Choose a plan', null],
  ])(
    'names the current plan and offers public pricing once when nothing is chosen (%#)',
    async (subscription, heading, sentence) => {
      const scaleCatalog = {
        ...catalog,
        plans: [{ ...PLAN, key: 'tier_3', name: 'Scale' }],
      };
      mswServer.use(
        http.get('/api/v1/billing/workspace-catalog', () => HttpResponse.json(scaleCatalog)),
        http.get('/api/v1/billing/entitlement', () => HttpResponse.json(entitlement(subscription))),
        http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
      );
      renderWithProviders(<PricingRoute />);
      expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
      if (sentence) expect(screen.getByText(sentence)).toBeVisible();
      else expect(screen.queryByText(/no plan yet|is on /u)).toBeNull();
      expect(screen.getAllByRole('link', { name: 'View public pricing' })).toHaveLength(1);
      expect(screen.queryByText(/^Workspace:/u)).toBeNull();
    },
  );

  it('stops naming a plan once a refetch of the entitlement fails', async () => {
    mswServer.use(
      http.get('/api/v1/billing/workspace-catalog', () =>
        HttpResponse.json({ ...catalog, plans: [{ ...PLAN, key: 'tier_3', name: 'Scale' }] }),
      ),
      http.get('/api/v1/billing/entitlement', () =>
        HttpResponse.json(entitlement(scaleSubscription)),
      ),
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
    );
    const { queryClient } = renderWithProviders(<PricingRoute />);
    expect(await screen.findByText(/is on Scale\./u)).toBeVisible();

    mswServer.use(
      http.get('/api/v1/billing/entitlement', () => new HttpResponse(null, { status: 500 })),
    );
    await queryClient.refetchQueries({ type: 'active' });
    await waitFor(() => expect(screen.queryByText(/is on Scale/u)).toBeNull());
  });

  it('keeps the public pricing link in the masthead when the workspace read fails', async () => {
    mswServer.use(
      http.get('/api/v1/billing/workspace-catalog', () => HttpResponse.json(catalog)),
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
    );
    renderWithProviders(<PricingRoute />, {
      projectSelection: { workspaces: [], activeWorkspace: null, isError: true },
    });
    expect(await screen.findByText("Couldn't load the workspace")).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'View public pricing' })).toHaveLength(1);
  });

  it('waits for confirmation, refreshes the catalog, and scopes the mutation to the selected workspace', async () => {
    const writes: Array<{ workspace: string | null; key: string | null }> = [];
    let reads = 0;
    mswServer.use(
      http.get('/api/v1/billing/workspace-catalog', () => {
        reads += 1;
        return HttpResponse.json(catalog);
      }),
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
      http.post('/api/v1/billing/addons', ({ request }) => {
        writes.push({
          workspace: request.headers.get('X-Workspace-Id'),
          key: request.headers.get('Idempotency-Key'),
        });
        return HttpResponse.json({ error: { message: 'unavailable' } }, { status: 503 });
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
    expect(screen.getAllByRole('link', { name: 'View public pricing' })).toHaveLength(1);
    expect(writes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Review current quote' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(reads).toBeGreaterThan(1);
    expect(writes[0]).toEqual({ workspace: workspaceId, key: 'captured-key' });
  });

  it('reports a refused purchase once, in the server sentence', async () => {
    mswServer.use(
      http.get('/api/v1/billing/workspace-catalog', () => HttpResponse.json(catalog)),
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
      http.post('/api/v1/billing/addons', () =>
        HttpResponse.json(
          {
            error: {
              code: 'billing_gstin_state_mismatch',
              message: 'The GSTIN does not match the selected state. Check both and try again.',
              request_id: 'req-1',
              retryable: false,
            },
          },
          { status: 409 },
        ),
      ),
    );
    globalThis.sessionStorage.setItem(
      PENDING_PRICING_INTENT_KEY,
      JSON.stringify({
        version: 1,
        kind: 'addon',
        catalog_key: 'addon_seats',
        quantity: 1,
        byok: true,
        country_code: null,
        billing_details: null,
        idempotency_key: 'refused-key',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );

    renderWithProviders(<PricingRoute />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review current quote' }));
    const sentence = 'The GSTIN does not match the selected state. Check both and try again.';
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getAllByText(sentence)).toHaveLength(1);
    expect(screen.queryByText('Quote unavailable.')).not.toBeInTheDocument();
  });

  it('shows the server quote before opening payment checkout', async () => {
    let created = 0;
    let opened = 0;
    let activationReads = 0;
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
    const planCatalog = { ...catalog, plans: [PLAN] };
    mswServer.use(
      http.get('/api/v1/billing/workspace-catalog', () => HttpResponse.json(planCatalog)),
      http.get('/api/v1/auth/me', () => HttpResponse.json({ user: signedInUser })),
      http.post('/api/v1/billing/subscriptions', () => {
        created += 1;
        return HttpResponse.json({
          activation_id: '11111111-1111-4111-8111-111111111111',
          kind: 'base',
          catalog_key: 'tier_1',
          quantity: 1,
          status: 'pending',
          quote,
          expires_at: '2026-12-01T12:00:00Z',
          failure_code: null,
        });
      }),
      http.get('/api/v1/billing/activations/11111111-1111-4111-8111-111111111111', () => {
        activationReads += 1;
        if (activationReads === 1) {
          return HttpResponse.json(
            { error: { message: 'temporarily unavailable' } },
            { status: 503 },
          );
        }
        return HttpResponse.json({
          activation_id: '11111111-1111-4111-8111-111111111111',
          kind: 'base',
          catalog_key: 'tier_1',
          quantity: 1,
          status: 'pending',
          quote,
          expires_at: '2026-12-01T12:00:00Z',
          failure_code: null,
        });
      }),
      http.get('/api/v1/billing/activations/11111111-1111-4111-8111-111111111111/checkout', () => {
        opened += 1;
        return HttpResponse.json({ error: { message: 'unavailable' } }, { status: 503 });
      }),
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
    await userEvent.clear(screen.getByRole('textbox', { name: 'Billing name' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Billing name' }), 'Updated buyer');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Current quote' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review current quote' }));
    expect(await screen.findByRole('region', { name: 'Current quote' })).toBeInTheDocument();
    expect(created).toBe(2);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and continue to payment' }));
    await waitFor(() => expect(activationReads).toBe(1));
    expect(opened).toBe(0);
    expect(screen.getByRole('region', { name: 'Current quote' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm and continue to payment' }));
    await waitFor(() => expect(opened).toBe(1));
  });
});
