import { randomUUID } from 'node:crypto';
import template from './billing-catalog.fixture.json' with { type: 'json' };
import { catalogSchema } from '../src/billing/catalog.ts';
import { digest, type Pending } from '../src/billing/contracts.ts';
import type { BillingProvider, Evidence, SubscriptionEvidence } from '../src/billing/razorpay.ts';
import type { Database } from '../src/db/database.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { Fixtures, testConfig } from './support.ts';

// Input emitted by the native launch author, not a parity/golden response.
export function billingConfig() {
  return testConfig({
    BILLING_CHECKOUT_ENABLED: 'true',
    BILLING_QUOTE_SIGNING_SECRET: 'fixture-independent-quote-secret',
    BILLING_RAZORPAY_MODE: 'test',
    BILLING_RAZORPAY_KEY_ID: 'rzp_test_fixture',
    BILLING_RAZORPAY_KEY_SECRET: 'fixture-gateway-secret',
    BILLING_RAZORPAY_WEBHOOK_SECRET: 'fixture-webhook-secret',
    BILLING_RAZORPAY_TEST_READY: 'true',
    BILLING_RAZORPAY_TEST_INTERNATIONAL_READY: 'true',
    BILLING_RAZORPAY_TEST_INDIA_READY: 'true',
    BILLING_SELLER_LEGAL_NAME: 'Fixture Seller',
    BILLING_SELLER_LEGAL_ADDRESS: '1 Seller Street',
    BILLING_SELLER_EMAIL: 'billing@example.test',
    BILLING_SELLER_GSTIN: '27ABCDE1234F1Z5',
    BILLING_SELLER_GST_STATE_CODE: '27',
    BILLING_SELLER_GST_STATE_NAME: 'Maharashtra',
    BILLING_SELLER_SAC: '998313',
    BILLING_SELLER_LUT_REFERENCE: 'fixture-LUT',
    BILLING_INDIA_GST_RATE: '0.18',
    BILLING_INDIA_GST_APPROVAL_REFERENCE: 'fixture-approval',
  });
}
export const buyer = {
  name: 'Buyer',
  address_line1: '1 Buyer Street',
  city: 'New York',
  state_code: null,
  postal_code: '10001',
  customer_gstin: null,
  export_eligibility_attested: true,
};

export class BillingFixtures extends Fixtures {
  readonly database: Database;
  private readonly revisions: string[] = [];
  // Non-fixture revisions this fixture retired; cleanup republishes them.
  private readonly retired: string[] = [];
  readonly accounts: string[] = [];
  readonly operatorCodes: string[] = [];
  constructor(db: Database) {
    super(db);
    this.database = db;
  }
  async tenant() {
    const userId = await this.user();
    const workspaceId = await this.ownedWorkspace(userId);
    const accountId = await billingAccount(this.database, workspaceId);
    await this.database
      .updateTable('billing_accounts')
      .set({
        owner_user_id: userId,
        billing_country: 'US',
        billing_profile: JSON.stringify(buyer),
        registration_cohort_at: new Date(),
      })
      .where('id', '=', accountId)
      .execute();
    this.accounts.push(accountId);
    return { userId, workspaceId, accountId };
  }
  async catalog(
    modify?: (payload: ReturnType<typeof catalogSchema.parse>) => void,
    published = true,
  ) {
    const payload = catalogSchema.parse(structuredClone(template));
    for (const plan of payload.plans)
      for (const [region, price] of Object.entries(plan.regional_byok_prices)) {
        price.provider_price_ref = `plan_${plan.key.replaceAll('_', '')}${region}`;
        price.tax_verified = true;
      }
    for (const item of [...payload.addons, ...payload.topups]) item.available = true;
    modify?.(payload);
    const revision = `fixture-${randomUUID()}`;
    payload.contact_sales_url = `https://example.test/contact/${revision}`;
    const actor = await this.user();
    if (published) {
      const retired = await this.database
        .updateTable('billing_catalog_revisions')
        .set({ publication_state: 'retired' })
        .where('publication_state', '=', 'published')
        .returning('revision')
        .execute();
      for (const row of retired)
        if (!row.revision.startsWith('fixture-') && !this.retired.includes(row.revision))
          this.retired.push(row.revision);
    }
    await this.database
      .insertInto('billing_catalog_revisions')
      .values({
        id: randomUUID(),
        revision,
        payload: JSON.stringify(payload),
        payload_sha256: digest(payload),
        publication_state: published ? 'published' : 'draft',
        created_by_user_id: actor,
        created_reason: 'fixture',
        created_at: new Date(),
        published_by_user_id: published ? actor : null,
        published_reason: 'fixture',
        published_at: published ? new Date() : null,
      })
      .execute();
    this.revisions.push(revision);
    return { revision, payload };
  }
  override async cleanup() {
    if (this.accounts.length) {
      await this.database
        .deleteFrom('consumable_ledger')
        .where('billing_account_id', 'in', this.accounts)
        .execute();
      await this.database
        .deleteFrom('introductory_claims')
        .where('billing_account_id', 'in', this.accounts)
        .execute();
      await this.database
        .deleteFrom('billing_invoices')
        .where('billing_account_id', 'in', this.accounts)
        .execute();
      await this.database
        .deleteFrom('billing_payments')
        .where('billing_account_id', 'in', this.accounts)
        .execute();
    }
    if (this.operatorCodes.length)
      await this.database
        .deleteFrom('introductory_operator_codes')
        .where('id', 'in', this.operatorCodes)
        .execute();
    if (this.revisions.length)
      await this.database
        .deleteFrom('billing_catalog_revisions')
        .where('revision', 'in', this.revisions)
        .execute();
    if (this.retired.length)
      await this.database
        .updateTable('billing_catalog_revisions')
        .set({ publication_state: 'published' })
        .where('revision', 'in', this.retired)
        .execute();
    await super.cleanup();
  }
}

export function paidSubscription(
  pending: Pending,
  options: Partial<SubscriptionEvidence> = {},
): Extract<Evidence, { kind: 'base' }> {
  const start = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000);
  const end = new Date(start.getTime() + 30 * 86_400_000);
  const quote = pending.quote as { total_price: { currency: 'USD' | 'INR'; amount_minor: number } };
  return {
    kind: 'base',
    subscription: {
      id: pending.external_reference!,
      status: 'active',
      priceRef: pending.external_price_id!,
      start,
      end,
      version: 1,
      cancelAtEnd: false,
      notes: {
        citeladder_intent_id: pending.id,
        citeladder_account_ref: pending.billing_account_id,
        citeladder_catalog_revision: pending.catalog_revision,
      },
      payment: {
        id: `pay_${pending.id.replaceAll('-', '')}`,
        orderId: null,
        invoiceId: `inv_${pending.id.replaceAll('-', '')}`,
        amount: quote.total_price.amount_minor,
        currency: quote.total_price.currency,
        paidAt: start,
        periodStart: start,
        periodEnd: end,
        taxMinor: null,
        method: 'card',
      },
      ...options,
    },
  };
}

export function fakeProvider(overrides: Partial<BillingProvider> = {}): BillingProvider {
  return {
    mode: 'test',
    create: async (pending) =>
      `${pending.activation_kind === 'base' ? 'sub' : 'order'}_${pending.id.replaceAll('-', '')}`,
    recover: async () => null,
    evidence: async () => {
      throw new Error('Unexpected provider read');
    },
    cancel: async () => {
      throw new Error('Unexpected cancellation');
    },
    change: async () => {},
    refund: async () => {
      throw new Error('Unexpected refund');
    },
    ...overrides,
  };
}
