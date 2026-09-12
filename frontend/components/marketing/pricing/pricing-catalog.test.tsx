import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { CONTACT_SALES_HREF, PENDING_PRICING_INTENT_KEY } from '@/lib/config/billing';
import { EXPORT_CHECKOUT_BODY, fillExportBillingDetails } from '@/test/fixtures/billing';

import { PricingCatalog } from './pricing-catalog';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const USER = {
  id: ACCOUNT,
  email: 'a@b.com',
  role: 'owner',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const assign = vi.fn();

vi.mock('@/lib/navigation/hard-navigate', () => ({
  hardNavigate: (url: string) => assign(url),
}));

function money(amount_minor: number) {
  return { currency: 'USD' as const, amount_minor };
}

function plan(key: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    name,
    description: `${name} plan`,
    cadence: 'monthly',
    self_serve: true,
    contact_only: false,
    contact_url: null,
    base_price: money(4900),
    credit_price: null,
    funded_total_price: null,
    checkout_available: true,
    unavailable_reason: 'funded_not_priced',
    capabilities: [
      {
        key: 'project_slots',
        capability_type: 'counter.occupancy',
        value: 3,
        issuable: true,
      },
      {
        key: 'audit_cadence',
        capability_type: 'level',
        value: 'daily',
        issuable: true,
      },
    ],
    trial_availability: 'unavailable',
    trial_unavailable_reason: 'trial_unavailable',
    trial_days: null,
    ...overrides,
  };
}

const CATALOG = {
  catalog_revision: 'commercial-v9',
  country_code: null,
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [
    plan('tier_1', 'Starter'),
    plan('tier_2', 'Growth', { base_price: money(9900) }),
    plan('tier_3', 'Scale', { base_price: money(19900) }),
    plan('enterprise', 'Enterprise', {
      self_serve: false,
      contact_only: true,
      contact_url: CONTACT_SALES_HREF,
      base_price: null,
      checkout_available: false,
      unavailable_reason: 'contact_sales',
    }),
  ],
  addons: [
    {
      key: 'addon_seats',
      name: 'Extra seats',
      description: 'More collaborators',
      cadence: 'monthly',
      unit_price: money(1900),
      quantity_min: 1,
      quantity_max: 20,
      availability: 'available',
      unavailable_reason: null,
      grant_key: 'seats',
      grant_value_per_unit: 1,
    },
    {
      key: 'addon_unpriced',
      name: 'Managed onboarding',
      description: 'Pricing to be announced',
      cadence: 'monthly',
      unit_price: null,
      quantity_min: 1,
      quantity_max: 1,
      availability: 'available',
      unavailable_reason: 'not_yet_priced',
      grant_key: 'onboarding',
      grant_value_per_unit: 1,
    },
  ],
  topups: [
    {
      key: 'topup_bench',
      name: 'Audit credits',
      description: 'A pack of audit credits',
      unit_price: money(2900),
      quantity_min: 1,
      quantity_max: 50,
      availability: 'available',
      unavailable_reason: null,
      grant_key: 'audit_credits',
      credits_per_unit: 100,
      expiry_days: 30,
    },
  ],
  providers: [],
};

const activation = (kind: string, catalog_key: string) => ({
  activation_id: ACCOUNT,
  kind,
  catalog_key,
  quantity: 1,
  status: 'pending',
  quote: {
    quote_id: 'q1',
    catalog_revision: 'commercial-v9',
    catalog_key,
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
    expires_at: '2026-08-01T12:00:00Z',
  },
  checkout_url: null,
  expires_at: '2026-08-01T12:00:00Z',
  failure_code: null,
});

const catalogHandler = () => http.get('/api/v1/billing/catalog', () => HttpResponse.json(CATALOG));
const noOfferHandler = () =>
  http.get('/api/v1/billing/early-access', () =>
    HttpResponse.json({
      campaign_id: ACCOUNT,
      status: 'unavailable',
      tier_key: 'tier_1',
      duration_days: 7,
      eligibility_policy: 'new_account',
      operator_code_allowed: true,
      unavailable_reason: 'campaign_disabled',
    }),
  );
const anonymous = () =>
  http.get('/api/v1/auth/me', () =>
    HttpResponse.json({ detail: 'unauthenticated' }, { status: 401 }),
  );
const authenticated = () => http.get('/api/v1/auth/me', () => HttpResponse.json({ user: USER }));

/**
 * Mount the catalog the way /pricing does: with NO workspace/project
 * selection above it.
 *
 * This is the point of the file. The page is public — it renders for
 * anonymous visitors and is prerendered at build time — so a consumer here
 * that needs the authenticated shell's context is not a degraded experience,
 * it is a build failure. Rendering inside the harness's default selection
 * would hide exactly that.
 */
const renderPricingPage = () => renderWithProviders(<PricingCatalog />, { projectSelection: null });

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  window.history.replaceState(null, '', '/pricing');
  globalThis.sessionStorage.clear();
  assign.mockClear();
});
afterEach(() => {
  mswServer.resetHandlers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => mswServer.close());

describe('PricingCatalog', () => {
  it('renders four tiers from the catalog without a free plan', async () => {
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' }, { timeout: 3_000 });
    expect(document.querySelectorAll('[data-tier]')).toHaveLength(4);
    expect(screen.queryByLabelText(/Billing country/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Billing details' })).not.toBeInTheDocument();
    for (const name of ['Starter', 'Growth', 'Scale', 'Enterprise']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).not.toMatch(/\bFree\b/);
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute(
      'href',
      CONTACT_SALES_HREF,
    );
  });

  it('defaults to BYOK', async () => {
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' });
    expect(screen.getByRole('switch', { name: /use your own api keys/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('keeps unsupported funded checkout disabled', async () => {
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' });
    await userEvent.click(screen.getByRole('switch', { name: /use your own api keys/i }));

    expect(
      screen.getByRole('button', {
        name: 'Choose Starter — checkout unavailable',
      }),
    ).toBeDisabled();
  });

  it('mirrors the switch into ?byok= while preserving other parameters', async () => {
    window.history.replaceState(null, '', '/pricing?utm=ads#plans');
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' });
    await userEvent.click(screen.getByRole('switch', { name: /use your own api keys/i }));

    await waitFor(() => expect(window.location.search).toContain('byok=0'));
    expect(window.location.search).toContain('utm=ads');
    expect(window.location.hash).toBe('#plans');
  });

  it('captures an anonymous click as an intent and issues no billing POST', async () => {
    let posted = 0;
    mswServer.use(
      catalogHandler(),
      anonymous(),
      http.post('/api/v1/billing/subscriptions', () => {
        posted += 1;
        return HttpResponse.json(activation('base', 'tier_1'));
      }),
    );
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' });
    await userEvent.click(await screen.findByRole('button', { name: /Choose Starter/ }));
    expect(
      screen.getByRole('dialog', { name: 'Complete your billing details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to checkout' })).toBeDisabled();
    expect(posted).toBe(0);
    expect(assign).not.toHaveBeenCalled();
    fillExportBillingDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Continue to checkout' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    expect(posted).toBe(0);

    const stored = JSON.parse(globalThis.sessionStorage.getItem(PENDING_PRICING_INTENT_KEY)!);
    expect(stored).toMatchObject({
      version: 1,
      kind: 'checkout',
      catalog_key: 'tier_1',
      quantity: 1,
      return_path: '/pricing',
    });
    expect(stored).not.toHaveProperty('amount');
  });

  it('resumes a captured intent after auth and issues one idempotent mutation', async () => {
    const bodies: unknown[] = [];
    const keys: string[] = [];
    mswServer.use(
      catalogHandler(),
      authenticated(),
      noOfferHandler(),
      http.get(`/api/v1/billing/activations/${ACCOUNT}`, () =>
        HttpResponse.json({
          ...activation('base', 'tier_1'),
          status: 'activated',
        }),
      ),
      http.post('/api/v1/billing/subscriptions', async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(activation('base', 'tier_1'));
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
        country_code: 'US',
        billing_details: {
          billing_name: 'CiteLadder',
          billing_address_line1: '1 Main Street',
          billing_city: 'New York',
          billing_state_code: '',
          billing_postal_code: '10001',
          customer_gstin: '',
          export_eligibility_attested: true,
        },
        idempotency_key: 'resume-key',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );
    window.history.replaceState(null, '', '/pricing?resumeActivation=1');

    renderPricingPage();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual(EXPORT_CHECKOUT_BODY);
    // The stored key is REUSED so a first attempt that did reach the backend
    // replays instead of charging twice.
    expect(keys[0]).toBe('resume-key');
    await waitFor(() =>
      expect(globalThis.sessionStorage.getItem(PENDING_PRICING_INTENT_KEY)).toBeNull(),
    );
  });

  it('discards a stale intent against the live catalog without any POST', async () => {
    let posted = 0;
    mswServer.use(
      catalogHandler(),
      authenticated(),
      noOfferHandler(),
      http.post('/api/v1/billing/subscriptions', () => {
        posted += 1;
        return HttpResponse.json(activation('base', 'tier_1'));
      }),
    );
    globalThis.sessionStorage.setItem(
      PENDING_PRICING_INTENT_KEY,
      JSON.stringify({
        version: 1,
        kind: 'checkout',
        catalog_key: 'tier_retired',
        quantity: 1,
        byok: true,
        country_code: null,
        idempotency_key: 'resume-key',
        return_path: '/pricing',
        created_at_ms: Date.now(),
      }),
    );
    window.history.replaceState(null, '', '/pricing?resumeActivation=1');

    renderPricingPage();

    expect(
      await screen.findByText(/no longer available. Please choose again/i),
    ).toBeInTheDocument();
    expect(posted).toBe(0);
    expect(globalThis.sessionStorage.getItem(PENDING_PRICING_INTENT_KEY)).toBeNull();
  });

  it('renders add-ons and top-ups generically, with unpriced entries unavailable', async () => {
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Add-ons' });
    const priced = document.querySelector('[data-catalog-key="addon_seats"]') as HTMLElement;
    expect(within(priced).getByRole('button', { name: /Add Extra seats/ })).toBeEnabled();

    const unpriced = document.querySelector('[data-catalog-key="addon_unpriced"]') as HTMLElement;
    expect(within(unpriced).getByText('Not yet priced')).toBeInTheDocument();
    expect(within(unpriced).getByRole('button', { name: /Add Managed onboarding/ })).toBeDisabled();

    // Forfeiture is a term of the sale, so it appears at purchase.
    const topup = document.querySelector('[data-catalog-key="topup_bench"]') as HTMLElement;
    expect(within(topup).getByText(/unused credits are forfeited/i)).toBeInTheDocument();
  });

  it('renders no price and no checkout when the catalog fails', async () => {
    mswServer.use(
      http.get('/api/v1/billing/catalog', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
      anonymous(),
    );
    renderPricingPage();

    expect(
      await screen.findByRole('button', { name: 'Retry' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-price]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Choose/ })).toBeNull();
  });

  it('renders no trial CTA anywhere', async () => {
    mswServer.use(catalogHandler(), noOfferHandler(), anonymous());
    renderPricingPage();

    await screen.findByRole('heading', { name: 'Starter' });
    expect(document.body.textContent).not.toMatch(/free trial|7 days free|start trial/i);
  });
});
