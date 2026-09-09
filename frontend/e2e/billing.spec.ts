import { expect, test, type Page, type Request } from '@playwright/test';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

async function fillExportBillingDetails(page: Page) {
  await page.getByLabel('Billing country (two-letter code)').fill('US');
  await page.getByLabel('Billing name').fill('CiteLadder Test');
  await page.getByLabel('Address').fill('1 Main Street');
  await page.getByLabel('City').fill('New York');
  await page.getByLabel('Postal code').fill('10001');
  await page
    .getByRole('checkbox', {
      name: 'I confirm this purchase qualifies as an export of service.',
    })
    .click();
}

test('billing: subscription modal verifies server activation', async ({ page }) => {
  const money = { currency: 'USD', amount_minor: 4900 };
  const quote = {
    quote_id: 'fixture',
    catalog_revision: 'commercial-v10',
    catalog_key: 'tier_1',
    credential_mode: 'byok',
    country_code: 'US',
    region: 'international',
    base_price: money,
    subtotal_price: money,
    discount: { currency: 'USD', amount_minor: 0 },
    taxable_value: money,
    credit_price: null,
    tax: { currency: 'USD', amount_minor: 0 },
    tax_treatment: 'EXPORT_ZERO_RATED',
    tax_rate: '0',
    cgst: { currency: 'USD', amount_minor: 0 },
    sgst: { currency: 'USD', amount_minor: 0 },
    igst: { currency: 'USD', amount_minor: 0 },
    tax_policy_version: 1,
    total_price: money,
    expires_at: '2099-01-01T00:00:00Z',
  };
  const activation = {
    activation_id: ACCOUNT,
    kind: 'base',
    catalog_key: 'tier_1',
    quantity: 1,
    status: 'pending',
    quote,
    checkout_url: null,
    expires_at: quote.expires_at,
    failure_code: null,
  };
  let verified = false;
  const attemptKeys: string[] = [];
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: ACCOUNT,
          email: 'payer@example.com',
          role: 'owner',
          is_active: true,
          created_at: '2026-09-08T00:00:00Z',
          updated_at: '2026-09-08T00:00:00Z',
        },
      },
    }),
  );
  await page.route('**/api/v1/billing/catalog**', (route) =>
    route.fulfill({
      json: {
        ...catalog,
        plans: [{ ...catalog.plans[0], checkout_available: true, unavailable_reason: null }],
      },
    }),
  );
  await page.route('**/api/v1/billing/early-access', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Unavailable' } }),
  );
  await page.route('**/api/v1/billing/subscriptions', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      country_code: 'US',
      credential_mode: 'byok',
    });
    attemptKeys.push(route.request().headers()['idempotency-key']);
    await route.fulfill({ status: 202, json: activation });
  });
  await page.route(`**/api/v1/billing/subscriptions/${ACCOUNT}/checkout`, (route) =>
    route.fulfill({
      json: {
        activation_id: ACCOUNT,
        provider_mode: 'test',
        key_id: 'rzp_test_fixture',
        subscription_id: 'sub_fixture',
        expires_at: quote.expires_at,
        quote,
      },
    }),
  );
  await page.route(`**/api/v1/billing/subscriptions/${ACCOUNT}/verify`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      razorpay_payment_id: 'pay_fixture',
      razorpay_subscription_id: 'sub_fixture',
      razorpay_signature: '0'.repeat(64),
    });
    verified = true;
    await route.fulfill({ status: 202, json: activation });
  });
  await page.route(`**/api/v1/billing/activations/${ACCOUNT}`, (route) =>
    route.fulfill({
      json: {
        ...activation,
        status: verified ? 'activated' : 'pending',
      },
    }),
  );
  await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.Razorpay = class {
      constructor(options) { this.options = options; }
      on() {}
      open() {
        if (this.options.prefill.email !== 'payer@example.com' || this.options.subscription_id !== 'sub_fixture' || 'amount' in this.options) throw new Error('Invalid checkout binding');
        const dialog = document.createElement('dialog');
        const button = document.createElement('button'); button.textContent = 'Complete test payment';
        const dismiss = document.createElement('button'); dismiss.textContent = 'Dismiss test payment';
        dismiss.onclick = () => { this.options.modal.ondismiss(); dialog.close(); dialog.remove(); };
        button.onclick = () => { this.options.handler({ razorpay_payment_id: 'pay_fixture', razorpay_subscription_id: 'sub_fixture', razorpay_signature: '0'.repeat(64) }); dialog.close(); dialog.remove(); };
        dialog.append(button, dismiss);
        document.body.append(dialog);
        dialog.showModal();
      }
    }`,
    }),
  );
  await page.goto('/pricing');
  await fillExportBillingDetails(page);
  await page.getByRole('button', { name: 'Choose Tier 1', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss test payment' }).click();
  await expect(
    page.getByText('Checkout closed. Retry to reopen the same subscription.'),
  ).toBeVisible();
  expect(verified).toBe(false);
  await page.getByRole('button', { name: 'Choose Tier 1', exact: true }).click();
  await page.getByRole('button', { name: 'Complete test payment' }).click();
  expect(attemptKeys).toHaveLength(2);
  expect(attemptKeys[0]).toBeTruthy();
  expect(attemptKeys[1]).toBe(attemptKeys[0]);
  await expect(page.getByText('Payment verified. Your subscription is active.')).toBeVisible();
  await expect(page.getByText('Test mode — no real money is charged.')).toBeVisible();
});

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
