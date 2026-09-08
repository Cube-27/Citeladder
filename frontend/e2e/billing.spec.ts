import { expect, test, type Request } from '@playwright/test';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

const catalog = {
  catalog_revision: 'commercial-v10',
  country_code: 'US',
  region: 'international',
  currency: 'USD',
  currency_minor_units: 2,
  plans: [
    {
      key: 'tier_1',
      name: 'Tier 1',
      description: 'Owned-site intelligence',
      cadence: 'monthly',
      self_serve: true,
      contact_only: false,
      contact_url: null,
      base_price: { currency: 'USD', amount_minor: 4900 },
      credit_price: { currency: 'USD', amount_minor: 9900 },
      funded_total_price: { currency: 'USD', amount_minor: 9900 },
      checkout_available: false,
      unavailable_reason: 'Payments are not available yet.',
      capabilities: [],
      trial_availability: 'unavailable',
      trial_unavailable_reason: 'Merchant readiness is pending.',
      trial_days: 7,
    },
  ],
  addons: [],
  topups: [],
  providers: [],
};

function assertSameOriginApi(requests: Request[], baseURL: string) {
  const origin = new URL(baseURL).origin;
  for (const request of requests.filter((item) => new URL(item.url()).pathname.includes('/api/'))) {
    expect(new URL(request.url()).origin).toBe(origin);
  }
}

test('billing: disabled checkout stays honest and no-card claim requires consent', async ({
  page,
  baseURL,
}) => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  let claimedBody: unknown;

  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: ACCOUNT,
          email: 'new-account@example.com',
          role: 'owner',
          is_active: true,
          created_at: '2026-09-08T00:00:00Z',
          updated_at: '2026-09-08T00:00:00Z',
        },
      },
    }),
  );
  await page.route('**/api/v1/billing/catalog', (route) => route.fulfill({ json: catalog }));
  await page.route('**/api/v1/billing/early-access', (route) =>
    route.fulfill({
      json: {
        campaign_id: ACCOUNT,
        status: 'available',
        tier_key: 'tier_1',
        duration_days: 7,
        eligibility_policy: 'new_account',
        operator_code_allowed: true,
        unavailable_reason: null,
      },
    }),
  );
  await page.route('**/api/v1/billing/early-access/claim', async (route) => {
    claimedBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        campaign_id: ACCOUNT,
        grant_id: '22222222-2222-4222-8222-222222222222',
        tier_key: 'tier_1',
        starts_at: '2026-09-08T00:00:00Z',
        expires_at: '2026-09-15T00:00:00Z',
        charged: false,
        renews: false,
      },
    });
  });

  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Tier 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /checkout unavailable/i })).toBeDisabled();
  await page.getByRole('button', { name: 'Claim 7-day early access' }).click();

  const claimButton = page
    .getByRole('button', { name: 'Claim 7-day early access', exact: true })
    .last();
  await expect(claimButton).toBeDisabled();
  const consent = page.getByRole('checkbox');
  await consent.nth(0).check();
  await consent.nth(1).check();
  await claimButton.click();

  await expect(page.getByText(/nothing renews and nothing will be charged/i)).toBeVisible();
  expect(claimedBody).toMatchObject({ terms_consent: true, data_sharing_consent: true });
  expect(JSON.stringify(claimedBody)).not.toMatch(/card|pan|cvv|amount/i);
  assertSameOriginApi(requests, baseURL!);
});
