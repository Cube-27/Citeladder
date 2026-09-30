import { randomUUID, createHmac, createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { createApp } from '../src/app.ts';
import { purchase, changePlan } from '../src/billing/purchases.ts';
import { settlePending, settleSubscription } from '../src/billing/settlement.ts';
import { recordRefund } from '../src/billing/receipts.ts';
import { cancelSubscription } from '../src/billing/cancellation.ts';
import { ProviderError } from '../src/billing/razorpay.ts';
import { recoverBilling } from '../src/billing/recovery.ts';
import { entitlementRead, usageRead, workspaceEntitlementRead } from '../src/billing/reads.ts';
import { claimOffer, endOffer, offerRead } from '../src/billing/journeys.ts';
import { sessionToken, testDatabase } from './support.ts';
import {
  BillingFixtures,
  billingConfig,
  buyer,
  fakeProvider,
  paidSubscription,
} from './billing-support.ts';

describe('billing money and access owner', () => {
  const config = billingConfig();
  const db = testDatabase(config);
  const fixtures = new BillingFixtures(db);
  beforeAll(() => fixtures.catalog());
  afterAll(async () => {
    await db.deleteFrom('billing_webhook_events').where('provider_mode', '=', 'test').execute();
    await fixtures.cleanup();
    await db.destroy();
  });
  const buy = async (workspace: string, key = randomUUID()) =>
    purchase(
      db,
      config,
      workspace,
      { kind: 'base', key: 'tier_1', quantity: 1, mode: 'byok', country: 'US', identity: buyer },
      key,
      fakeProvider(),
    );
  const pending = (id: string) =>
    db.selectFrom('pending_activations').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  async function activated() {
    const t = await fixtures.tenant();
    const response = await buy(t.workspaceId);
    const row = await pending(response.activation_id);
    const evidence = paidSubscription(row);
    await db
      .transaction()
      .execute((trx) => settlePending(trx, row.id, 'test', evidence, 'reconciliation'));
    const sub = await db
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    return { ...t, row, evidence, sub };
  }
  it('commits one intent before I/O, freezes its quote, and replays through disabled checkout', async () => {
    const t = await fixtures.tenant();
    const key = randomUUID();
    const create = vi.fn(async (row) => {
      expect(await pending(row.id)).toMatchObject({
        idempotency_key: key,
        external_reference: null,
      });
      return `sub_${row.id.replaceAll('-', '')}`;
    });
    const args = {
      kind: 'base',
      key: 'tier_1',
      quantity: 1,
      mode: 'byok',
      country: 'US',
      identity: buyer,
    } as const;
    const results = await Promise.all([
      purchase(db, config, t.workspaceId, args, key, fakeProvider({ create })),
      purchase(db, config, t.workspaceId, args, key, fakeProvider({ create })),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((row) => row.activation_id)).size).toBe(1);
    const replay = await purchase(
      db,
      { ...config, billing: { ...config.billing, enabled: false } },
      t.workspaceId,
      args,
      key,
    );
    expect(replay.quote).toEqual(results[0]!.quote);
    await expect(
      purchase(db, config, t.workspaceId, { ...args, key: 'tier_2' }, key, fakeProvider()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(buy(t.workspaceId)).rejects.toMatchObject({ status: 409 });
  });
  it('preserves uncertain creation and recovers without creating or granting twice', async () => {
    const t = await fixtures.tenant();
    const key = randomUUID();
    // The committed intent is truthful: the client polls while recovery resolves it.
    const accepted = await purchase(
      db,
      config,
      t.workspaceId,
      { kind: 'base', key: 'tier_1', quantity: 1, mode: 'byok', country: 'US', identity: buyer },
      key,
      fakeProvider({
        create: async () => {
          throw new ProviderError(true);
        },
      }),
    );
    expect(accepted.status).toBe('pending');
    const row = await db
      .selectFrom('pending_activations')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'pending', external_reference: null });
    const ref = `sub_${row.id.replaceAll('-', '')}`;
    const evidence = paidSubscription({ ...row, external_reference: ref });
    await db
      .updateTable('pending_activations')
      .set({ reconciliation_next_at: new Date() })
      .where('id', '=', row.id)
      .execute();
    const provider = fakeProvider({
      recover: async (input) => (input.id === row.id ? ref : null),
      evidence: async () => evidence,
    });
    await Promise.all([recoverBilling(db, config, provider), recoverBilling(db, config, provider)]);
    expect((await pending(row.id)).status).toBe('activated');
    const receipts = await db
      .selectFrom('billing_payments')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .execute();
    expect(receipts).toHaveLength(1);
    const invoices = await db
      .selectFrom('billing_invoices')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .execute();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.total_amount_minor).toBe(receipts[0]!.amount_minor);
  });
  it('abandons an unpaid checkout past its window even after attempts are exhausted', async () => {
    const t = await fixtures.tenant();
    const response = await buy(t.workspaceId);
    const row = await pending(response.activation_id);
    await db
      .updateTable('pending_activations')
      .set({
        created_at: new Date(Date.now() - (config.billing.abandonSeconds + 60) * 1000),
        reconciliation_attempts: config.billing.attempts,
        reconciliation_next_at: new Date(),
      })
      .where('id', '=', row.id)
      .execute();
    const unpaid = paidSubscription(row, { status: 'created', payment: null });
    const cancel = vi.fn(async (reference: string) => ({
      ...unpaid.subscription,
      id: reference,
      status: 'cancelled',
    }));
    await recoverBilling(
      db,
      { ...config, billing: { ...config.billing, batchSize: 1000 } },
      fakeProvider({
        evidence: async (reference) => {
          if (reference !== row.external_reference) throw new ProviderError(true);
          return unpaid;
        },
        cancel,
      }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect((await pending(row.id)).status).toBe('abandoned');
    // The terminal row no longer blocks a new base purchase.
    expect((await buy(t.workspaceId)).status).toBe('pending');
  });
  it('settles concurrent evidence once and refuses an active subscription without a captured invoice', async () => {
    const t = await fixtures.tenant();
    const response = await buy(t.workspaceId);
    const row = await pending(response.activation_id);
    const absent = paidSubscription(row, { payment: null });
    await db.transaction().execute((trx) => settlePending(trx, row.id, 'test', absent, 'webhook'));
    expect((await pending(row.id)).status).toBe('pending');
    const evidence = paidSubscription(row);
    await Promise.all(
      ['webhook', 'reconciliation'].map((authority) =>
        db.transaction().execute((trx) => settlePending(trx, row.id, 'test', evidence, authority)),
      ),
    );
    expect(
      await db
        .selectFrom('billing_subscriptions')
        .select('id')
        .where('billing_account_id', '=', t.accountId)
        .execute(),
    ).toHaveLength(1);
    const grants = await db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .execute();
    expect(new Set(grants.map((row) => row.bundle_id)).size).toBe(1);
    expect(
      grants.every(
        (row) =>
          row.catalog_revision === response.quote.catalog_revision && row.period_start !== null,
      ),
    ).toBe(true);
  });
  it('renews a slow claim and prevents an expired worker from settling after reacquisition', async () => {
    await db
      .updateTable('billing_subscriptions')
      .set({ reconciliation_next_at: new Date(Date.now() + 3600_000) })
      .execute();
    await db
      .updateTable('pending_activations')
      .set({ reconciliation_next_at: new Date(Date.now() + 3600_000) })
      .where('status', '=', 'pending')
      .execute();
    const t = await fixtures.tenant();
    const response = await buy(t.workspaceId);
    const row = await pending(response.activation_id);
    await db
      .updateTable('pending_activations')
      .set({ reconciliation_next_at: new Date() })
      .where('id', '=', row.id)
      .execute();
    const evidence = paidSubscription(row);
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let complete!: (value: typeof evidence) => void;
    const slow = new Promise<typeof evidence>((resolve) => {
      complete = resolve;
    });
    const short = { ...config, billing: { ...config.billing, leaseSeconds: 1, batchSize: 1 } };
    const first = recoverBilling(
      db,
      short,
      fakeProvider({
        evidence: async () => {
          entered();
          return slow;
        },
      }),
    );
    await started;
    const claimed = await pending(row.id);
    await vi.waitFor(
      async () => {
        expect((await pending(row.id)).reconciliation_lease_expires_at!.getTime()).toBeGreaterThan(
          claimed.reconciliation_lease_expires_at!.getTime(),
        );
      },
      { timeout: 2000 },
    );
    await db
      .updateTable('pending_activations')
      .set({
        reconciliation_lease_expires_at: new Date(Date.now() - 1000),
        reconciliation_next_at: new Date(),
      })
      .where('id', '=', row.id)
      .execute();
    const replacement = structuredClone(evidence);
    replacement.subscription.payment!.id = `pay_${randomUUID().replaceAll('-', '')}`;
    await recoverBilling(db, short, fakeProvider({ evidence: async () => replacement }));
    complete(evidence);
    await first;
    expect((await pending(row.id)).status).toBe('activated');
    const payments = await db
      .selectFrom('billing_payments')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .execute();
    expect(payments.map((payment) => payment.external_payment_id)).toEqual([
      replacement.subscription.payment!.id,
    ]);
  });
  it('retains a paid terminal period and invalidates the lifecycle projection once', async () => {
    const t = await activated();
    const before = await db
      .selectFrom('billing_accounts')
      .select('entitlement_lifecycle_version')
      .where('id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    const terminal = {
      ...t.evidence.subscription,
      payment: null,
      status: 'cancelled',
      version: 2,
      start: null,
      end: null,
    };
    await db
      .transaction()
      .execute((trx) => settleSubscription(trx, t.sub, terminal, t.row, t.workspaceId));
    const sub = await db
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('id', '=', t.sub.id)
      .executeTakeFirstOrThrow();
    expect(sub).toMatchObject({
      status: 'cancel_scheduled',
      is_current: true,
      current_period_end: t.sub.current_period_end,
    });
    const version = await db
      .selectFrom('billing_accounts')
      .select('entitlement_lifecycle_version')
      .where('id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    expect(version.entitlement_lifecycle_version).toBe(before.entitlement_lifecycle_version + 1);
    await db
      .transaction()
      .execute((trx) => settleSubscription(trx, sub, terminal, t.row, t.workspaceId));
    expect(
      await db
        .selectFrom('billing_accounts')
        .select('entitlement_lifecycle_version')
        .where('id', '=', t.accountId)
        .executeTakeFirstOrThrow(),
    ).toEqual(version);
  });
  it('uses frozen renewal terms, preserves legacy bundle identity, and rejects overlap and stale regressions', async () => {
    const t = await activated();
    if (t.evidence.kind !== 'base') throw new Error('fixture');
    await db
      .updateTable('account_grants')
      .set({ idempotency_key: 'legacy-period-key', bundle_id: 'legacy-period-key' })
      .where('billing_account_id', '=', t.accountId)
      .execute();
    await db
      .updateTable('billing_payments')
      .set({ receipt_sha256: 'a'.repeat(64) })
      .where('billing_account_id', '=', t.accountId)
      .execute();
    await db
      .transaction()
      .execute((trx) =>
        settleSubscription(trx, t.sub, t.evidence.subscription, t.row, t.workspaceId),
      );
    expect(
      new Set(
        (
          await db
            .selectFrom('account_grants')
            .select('bundle_id')
            .where('billing_account_id', '=', t.accountId)
            .execute()
        ).map((row) => row.bundle_id),
      ),
    ).toEqual(new Set(['legacy-period-key']));
    await fixtures.catalog((payload) => {
      payload.plans[0]!.grants.find((row) => row.key === 'project_slots')!.value += 3;
    });
    const start = t.sub.current_period_end!;
    const end = new Date(start.getTime() + 30 * 86_400_000);
    const event = {
      ...t.evidence.subscription,
      version: 2,
      start,
      end,
      payment: {
        ...t.evidence.subscription.payment!,
        id: `pay_${randomUUID().replaceAll('-', '')}`,
        invoiceId: `inv_${randomUUID().replaceAll('-', '')}`,
        periodStart: start,
        periodEnd: end,
        paidAt: start,
      },
    };
    await db
      .transaction()
      .execute((trx) => settleSubscription(trx, t.sub, event, t.row, t.workspaceId));
    const renewed = await db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .where('period_start', '=', start)
      .execute();
    expect(renewed.find((row) => row.key === 'project_slots')!.value).toBe(
      (t.sub.frozen_terms as { grant_specs: [string, number][] }).grant_specs.find(
        ([key]) => key === 'project_slots',
      )![1],
    );
    await db
      .transaction()
      .execute((trx) =>
        settleSubscription(
          trx,
          t.sub,
          { ...t.evidence.subscription, version: 1, status: 'cancelled' },
          t.row,
          t.workspaceId,
        ),
      );
    expect(
      (
        await db
          .selectFrom('billing_subscriptions')
          .selectAll()
          .where('id', '=', t.sub.id)
          .executeTakeFirstOrThrow()
      ).current_period_end,
    ).toEqual(end);
    const overlapStart = new Date(start.getTime() - 1000);
    await expect(
      db.transaction().execute((trx) =>
        settleSubscription(
          trx,
          t.sub,
          {
            ...event,
            version: 3,
            start: overlapStart,
            payment: { ...event.payment, periodStart: overlapStart },
          },
          t.row,
          t.workspaceId,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('refunds append capped receipts and exact credit allocations, preserving consumed evidence', async () => {
    const t = await activated();
    const payment = await db
      .selectFrom('billing_payments')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    const refund = {
      id: `rfnd_${randomUUID().replaceAll('-', '')}`,
      paymentId: payment.external_payment_id,
      amount: 1,
      status: 'processed',
      createdAt: new Date(),
    };
    await Promise.all(
      [1, 2].map(() =>
        db
          .transaction()
          .execute((trx) =>
            recordRefund(trx, t.workspaceId, t.accountId, 'razorpay', 'test', refund),
          ),
      ),
    );
    const rest = {
      ...refund,
      id: `rfnd_${randomUUID().replaceAll('-', '')}`,
      amount: payment.amount_minor - 1,
    };
    await db
      .transaction()
      .execute((trx) => recordRefund(trx, t.workspaceId, t.accountId, 'razorpay', 'test', rest));
    const notes = await db
      .selectFrom('billing_invoices')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .where('document_kind', '=', 'credit_note')
      .execute();
    expect(notes.reduce((sum, row) => sum + row.total_amount_minor, 0)).toBe(payment.amount_minor);
    expect(
      notes.every(
        (row) => row.invoice_number.startsWith('CLC/') && row.invoice_number.length <= 16,
      ),
    ).toBe(true);
    expect(
      await db
        .selectFrom('grant_revocations')
        .innerJoin('account_grants', 'account_grants.id', 'grant_revocations.grant_id')
        .select('grant_revocations.id')
        .where('account_grants.billing_account_id', '=', t.accountId)
        .execute(),
    ).not.toHaveLength(0);
    await expect(
      db.transaction().execute((trx) =>
        recordRefund(trx, t.workspaceId, t.accountId, 'razorpay', 'test', {
          ...refund,
          id: 'rfnd_excess',
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      db
        .transaction()
        .execute((trx) =>
          recordRefund(trx, t.workspaceId, t.accountId, 'razorpay', 'live', refund),
        ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('allocates unique GST-length invoice and receipt numbers across the Indian April boundary', async () => {
    const times = ['2026-03-31T18:29:59Z', '2026-03-31T18:30:00Z', '2026-03-31T18:30:01Z'];
    const rows = await Promise.all(
      times.map(async (paidAt) => {
        const t = await fixtures.tenant();
        const response = await buy(t.workspaceId);
        const row = await pending(response.activation_id);
        const evidence = paidSubscription(row);
        if (evidence.kind !== 'base') throw new Error('fixture');
        evidence.subscription.payment!.paidAt = new Date(paidAt);
        await db
          .transaction()
          .execute((trx) => settlePending(trx, row.id, 'test', evidence, 'reconciliation'));
        return db
          .selectFrom('billing_invoices')
          .selectAll()
          .select(sql<string>`invoice_date::text`.as('persisted_day'))
          .where('billing_account_id', '=', t.accountId)
          .executeTakeFirstOrThrow();
      }),
    );
    expect(rows.map((row) => row.financial_year)).toEqual(['2025-26', '2026-27', '2026-27']);
    expect(rows.map((row) => row.persisted_day)).toEqual([
      '2026-03-31',
      '2026-04-01',
      '2026-04-01',
    ]);
    expect(new Set(rows.map((row) => row.invoice_number)).size).toBe(3);
    expect(
      rows.every(
        (row) =>
          /^[A-Z0-9]{1,3}\/\d{4}\/\d{6}$/u.test(row.invoice_number) &&
          row.invoice_number.length <= 16 &&
          row.receipt_number.length <= 16,
      ),
    ).toBe(true);
    expect(new Set(rows.map((row) => row.receipt_number)).size).toBe(3);
  });
  async function upgrade(paidAt = new Date()) {
    const t = await activated();
    const result = await changePlan(
      db,
      config,
      t.workspaceId,
      'tier_2',
      randomUUID(),
      fakeProvider(),
    );
    expect(result).toMatchObject({ direction: 'upgrade', status: 'payment_required' });
    const row = await pending(result.activation!.activation_id);
    const quote = result.activation!.quote;
    const payment = {
      kind: 'payment',
      reference: row.external_reference!,
      notes: {
        citeladder_intent_id: row.id,
        citeladder_account_ref: t.accountId,
        citeladder_catalog_revision: row.catalog_revision,
      },
      payment: {
        id: `pay_${randomUUID().replaceAll('-', '')}`,
        invoiceId: null,
        orderId: row.external_reference,
        amount: quote.total_price.amount_minor,
        currency: quote.total_price.currency,
        paidAt,
        periodStart: null,
        periodEnd: null,
        taxMinor: null,
        method: 'card',
      },
    } as const;
    return { t, row, payment };
  }
  it('settles an upgrade once, preserving the current paid period and frozen renewal target', async () => {
    await fixtures.catalog();
    const { t, row, payment } = await upgrade();
    await Promise.all(
      ['webhook', 'reconciliation'].map((authority) =>
        db.transaction().execute((trx) => settlePending(trx, row.id, 'test', payment, authority)),
      ),
    );
    const sub = await db
      .selectFrom('billing_subscriptions')
      .selectAll()
      .where('id', '=', t.sub.id)
      .executeTakeFirstOrThrow();
    expect(sub).toMatchObject({
      catalog_key: 'tier_1',
      current_period_end: t.sub.current_period_end,
    });
    expect(sub.scheduled_change).toMatchObject({
      direction: 'upgrade',
      catalog_key: 'tier_2',
      terms: { catalog_revision: row.catalog_revision },
    });
    const upgrades = await db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .where('source_ref', '=', `activation:${row.id}`)
      .execute();
    expect(new Set(upgrades.map((row) => row.bundle_id)).size).toBe(1);
    expect(
      upgrades.every((row) => row.valid_until?.getTime() === t.sub.current_period_end!.getTime()),
    ).toBe(true);
  });
  it('keeps the receipt for an upgrade paid after its period, granting nothing', async () => {
    await fixtures.catalog();
    const { t, row, payment } = await upgrade(new Date(Date.now() + 40 * 86_400_000));
    await db.transaction().execute((trx) => settlePending(trx, row.id, 'test', payment, 'webhook'));
    expect((await pending(row.id)).status).toBe('activated');
    const receipts = await db
      .selectFrom('billing_payments')
      .select('external_payment_id')
      .where('billing_account_id', '=', t.accountId)
      .execute();
    expect(receipts.map((receipt) => receipt.external_payment_id)).toContain(payment.payment.id);
    const grants = await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', t.accountId)
      .where('source_ref', '=', `activation:${row.id}`)
      .execute();
    expect(grants).toHaveLength(0);
    const sub = await db
      .selectFrom('billing_subscriptions')
      .select('scheduled_change')
      .where('id', '=', t.sub.id)
      .executeTakeFirstOrThrow();
    expect(sub.scheduled_change).toBeNull();
  });
  it('issues fixed-expiry one-time grants and rejects a mismatched captured amount atomically', async () => {
    await fixtures.catalog();
    const t = await activated();
    const published = await db
      .selectFrom('billing_catalog_revisions')
      .selectAll()
      .where('publication_state', '=', 'published')
      .executeTakeFirstOrThrow();
    const item = (published.payload as { addons: { key: string }[] }).addons[0]!;
    const response = await purchase(
      db,
      config,
      t.workspaceId,
      { kind: 'addon', key: item.key, quantity: 1, mode: 'byok' },
      randomUUID(),
      fakeProvider(),
    );
    const row = await pending(response.activation_id);
    const payment = {
      kind: 'payment',
      reference: row.external_reference!,
      notes: { citeladder_intent_id: row.id, citeladder_account_ref: t.accountId },
      payment: {
        id: `pay_${randomUUID().replaceAll('-', '')}`,
        invoiceId: null,
        orderId: row.external_reference,
        amount: response.quote.total_price.amount_minor,
        currency: response.quote.total_price.currency,
        paidAt: new Date(),
        periodStart: null,
        periodEnd: null,
        taxMinor: null,
        method: 'card',
      },
    } as const;
    await expect(
      db
        .transaction()
        .execute((trx) =>
          settlePending(
            trx,
            row.id,
            'test',
            { ...payment, payment: { ...payment.payment, amount: payment.payment.amount + 1 } },
            'webhook',
          ),
        ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await pending(row.id)).status).toBe('pending');
    await db.transaction().execute((trx) => settlePending(trx, row.id, 'test', payment, 'webhook'));
    const grants = await db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .where('source_ref', '=', `activation:${row.id}`)
      .execute();
    expect(
      grants.every((row) => row.bundle_role === 'supplement' && row.valid_until! > row.valid_from),
    ).toBe(true);
    expect(
      (await entitlementRead(db, t.workspaceId, new Date())).grants
        .filter((grant) => grants.some((row) => row.id === grant.grant_id))
        .every(
          (grant) =>
            new Date(grant.effective_valid_until!).getTime() <= t.sub.current_period_end!.getTime(),
        ),
    ).toBe(true);
    await db
      .updateTable('billing_subscriptions')
      .set({ current_period_end: new Date(Date.now() - 1000) })
      .where('id', '=', t.sub.id)
      .execute();
    await expect(
      purchase(
        db,
        config,
        t.workspaceId,
        { kind: 'addon', key: item.key, quantity: 1, mode: 'byok' },
        randomUUID(),
        fakeProvider(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('freezes downgrade terms and refuses changing cancellation through another environment', async () => {
    const t = await activated();
    await fixtures.catalog((payload) => {
      const plan = payload.plans.find((row) => row.key === 'tier_2')!;
      plan.byok_price!.amount_minor = 100;
      plan.regional_byok_prices.international!.amount_minor = 100;
    });
    const change = vi.fn(async () => {});
    const result = await changePlan(
      db,
      config,
      t.workspaceId,
      'tier_2',
      randomUUID(),
      fakeProvider({ change }),
    );
    expect(result).toMatchObject({ direction: 'downgrade', status: 'scheduled' });
    expect(change).toHaveBeenCalledTimes(1);
    // A refused switch is reported, and the same key can request it again.
    const refused = await activated();
    const key = randomUUID();
    const reject = vi.fn(async () => {
      throw new ProviderError(false, 'provider_rejected');
    });
    await expect(
      changePlan(db, config, refused.workspaceId, 'tier_2', key, fakeProvider({ change: reject })),
    ).rejects.toMatchObject({ status: 502 });
    expect(
      await changePlan(db, config, refused.workspaceId, 'tier_2', key, fakeProvider({ change })),
    ).toMatchObject({ direction: 'downgrade', status: 'scheduled' });
    await expect(
      cancelSubscription(
        db,
        { ...config, razorpay: { ...config.razorpay, mode: 'live' } },
        t.workspaceId,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const cancel = vi.fn(async () => {
      throw new ProviderError(true);
    });
    expect(
      await cancelSubscription(db, config, t.workspaceId, fakeProvider({ cancel })),
    ).toMatchObject({ status: 'cancellation_scheduled' });
    expect(
      await cancelSubscription(db, config, t.workspaceId, fakeProvider({ cancel })),
    ).toMatchObject({ status: 'already_scheduled' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('authenticates bounded webhook bytes, persists before settlement, and quarantines conflicting replay', async () => {
    const t = await activated();
    const app = createApp(config, db);
    const eventId = randomUUID();
    const body = JSON.stringify({
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: t.sub.external_subscription_id, status: 'active' } },
      },
    });
    const headers = (text: string) => ({
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': createHmac('sha256', config.razorpay.webhookSecret)
        .update(text)
        .digest('hex'),
    });
    expect(
      (
        await app.request('/api/v1/billing/webhooks/razorpay', {
          method: 'POST',
          body,
          headers: { 'x-razorpay-event-id': eventId },
        })
      ).status,
    ).toBe(400);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await app.request('/api/v1/billing/webhooks/razorpay', {
            method: 'POST',
            body,
            headers: headers(body),
          })
        ).status,
      ).toBe(204);
    const receipt = await db
      .selectFrom('billing_webhook_events')
      .selectAll()
      .where('external_event_id', '=', eventId)
      .executeTakeFirstOrThrow();
    expect(receipt.processing_state).toBe('pending');
    await recoverBilling(db, config, fakeProvider({ evidence: async () => t.evidence }));
    expect(
      (
        await db
          .selectFrom('billing_webhook_events')
          .selectAll()
          .where('id', '=', receipt.id)
          .executeTakeFirstOrThrow()
      ).processing_state,
    ).toBe('completed');
    const conflicting = body.replace('active', 'cancelled');
    expect(
      (
        await app.request('/api/v1/billing/webhooks/razorpay', {
          method: 'POST',
          body: conflicting,
          headers: headers(conflicting),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await db
          .selectFrom('billing_webhook_events')
          .selectAll()
          .where('id', '=', receipt.id)
          .executeTakeFirstOrThrow()
      ).processing_state,
    ).toBe('quarantined');
    const tiny = createApp({ ...config, billing: { ...config.billing, webhookBytes: 8 } }, db);
    expect(
      (
        await tiny.request('/api/v1/billing/webhooks/razorpay', {
          method: 'POST',
          body,
          headers: headers(body),
        })
      ).status,
    ).toBe(413);
  });
  it('defers refund settlement until authoritative processing completes', async () => {
    const t = await activated();
    const payment = await db
      .selectFrom('billing_payments')
      .selectAll()
      .where('billing_account_id', '=', t.accountId)
      .executeTakeFirstOrThrow();
    const refund = {
      id: `rfnd_${randomUUID().replaceAll('-', '')}`,
      paymentId: payment.external_payment_id,
      amount: payment.amount_minor,
      status: 'processing',
      createdAt: new Date(),
    };
    const eventId = randomUUID();
    const body = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: refund.id, status: 'processed' } } },
    });
    const headers = {
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': createHmac('sha256', config.razorpay.webhookSecret)
        .update(body)
        .digest('hex'),
    };
    expect(
      (
        await createApp(config, db).request('/api/v1/billing/webhooks/razorpay', {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(204);
    await recoverBilling(db, config, fakeProvider({ refund: async () => refund }));
    const receipt = await db
      .selectFrom('billing_webhook_events')
      .selectAll()
      .where('external_event_id', '=', eventId)
      .executeTakeFirstOrThrow();
    expect(receipt.processing_state).toBe('pending');
    expect(
      await db
        .selectFrom('billing_payments')
        .select('id')
        .where('billing_account_id', '=', t.accountId)
        .where('receipt_kind', '=', 'refund')
        .execute(),
    ).toHaveLength(0);
    await db
      .updateTable('billing_webhook_events')
      .set({ next_attempt_at: new Date() })
      .where('id', '=', receipt.id)
      .execute();
    await recoverBilling(
      db,
      config,
      fakeProvider({ refund: async () => ({ ...refund, status: 'processed' }) }),
    );
    expect(
      (
        await db
          .selectFrom('billing_webhook_events')
          .selectAll()
          .where('id', '=', receipt.id)
          .executeTakeFirstOrThrow()
      ).processing_state,
    ).toBe('completed');
    expect(
      await db
        .selectFrom('billing_invoices')
        .select('id')
        .where('billing_account_id', '=', t.accountId)
        .where('document_kind', '=', 'credit_note')
        .execute(),
    ).toHaveLength(1);
  });
  it('isolates billing reads and activation IDs, and never repairs a missing account', async () => {
    const t = await activated();
    const member = await fixtures.user();
    await fixtures.member(t.workspaceId, member, 'member');
    const app = createApp(config, db);
    const request = async (user: string, url: string, workspace = t.workspaceId) =>
      app.request(url, {
        headers: {
          cookie: `${config.session.cookieName}=${await sessionToken({ sub: user, ver: 0 })}`,
          'x-workspace-id': workspace,
        },
      });
    // Billing reads are administrative: owner and admin succeed, member and viewer are refused.
    const admin = await fixtures.user();
    await fixtures.member(t.workspaceId, admin, 'admin');
    const viewer = await fixtures.user();
    await fixtures.member(t.workspaceId, viewer, 'viewer');
    for (const [user, status] of [
      [t.userId, 200],
      [admin, 200],
      [member, 403],
      [viewer, 403],
    ] as const)
      expect((await request(user, '/api/v1/billing/usage')).status).toBe(status);
    expect((await request(member, `/api/v1/workspaces/${t.workspaceId}/entitlements`)).status).toBe(
      200,
    );
    const other = await fixtures.tenant();
    expect(
      (await request(other.userId, `/api/v1/billing/activations/${t.row.id}`, other.workspaceId))
        .status,
    ).toBe(404);
    const user = await fixtures.user();
    const workspace = await fixtures.ownedWorkspace(user);
    expect(await workspaceEntitlementRead(db, workspace, new Date())).toMatchObject({
      status: 'entitlement_unresolved',
    });
    expect(
      await db
        .selectFrom('billing_accounts')
        .select('id')
        .where('workspace_id', '=', workspace)
        .execute(),
    ).toHaveLength(0);
    expect(await usageRead(db, other.workspaceId, new Date())).toMatchObject({
      status: 'resolved',
    });
    expect(
      (await entitlementRead(db, t.workspaceId, new Date())).capabilities.length,
    ).toBeGreaterThan(0);
  });
  it('reads checkout and verifies a browser callback without provider I/O or paid access', async () => {
    const t = await fixtures.tenant();
    const response = await buy(t.workspaceId);
    const row = await pending(response.activation_id);
    const app = createApp(config, db);
    const headers = {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: t.userId, ver: 0 })}`,
      'x-workspace-id': t.workspaceId,
      'content-type': 'application/json',
    };
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected provider I/O'));
    try {
      const disabled = createApp({ ...config, billing: { ...config.billing, enabled: false } }, db);
      const pricing = await disabled.request('/api/v1/billing/catalog?country=US');
      expect(pricing.status).toBe(200);
      const catalog = (await pricing.json()) as {
        plans: { checkout_available: boolean }[];
        addons: { availability: string }[];
      };
      expect(
        catalog.plans.every((plan) => !plan.checkout_available) &&
          catalog.addons.every((item) => item.availability === 'unavailable'),
      ).toBe(true);
      const checkout = await app.request(`/api/v1/billing/activations/${row.id}/checkout`, {
        headers,
      });
      expect(checkout.status).toBe(200);
      const fields = {
        razorpay_payment_id: 'pay_browser',
        razorpay_subscription_id: row.external_reference!,
        razorpay_signature: createHmac('sha256', config.razorpay.keySecret)
          .update(`pay_browser|${row.external_reference}`)
          .digest('hex'),
      };
      const verified = await app.request(`/api/v1/billing/activations/${row.id}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fields }),
      });
      expect(verified.status).toBe(202);
      expect(await verified.json()).toMatchObject({ status: 'pending' });
      expect(transport).not.toHaveBeenCalled();
      expect(
        await db
          .selectFrom('account_grants')
          .select('id')
          .where('billing_account_id', '=', t.accountId)
          .execute(),
      ).toHaveLength(0);
      expect((await pending(row.id)).reconciliation_next_at).not.toBeNull();
    } finally {
      transport.mockRestore();
    }
  });
  it('consumes an account-scoped operator waiver once and preserves its replay identity', async () => {
    await fixtures.catalog((payload) => {
      payload.campaign.state = 'enabled';
      payload.campaign.enabled = true;
      payload.campaign.claim_available = true;
      payload.campaign.eligibility_policy = 'oauth_verified_work_email';
      payload.campaign.cohort_started_at = new Date(Date.now() - 86_400_000).toISOString();
    });
    const t = await fixtures.tenant(),
      other = await fixtures.tenant();
    const code = randomUUID(),
      codeId = randomUUID();
    fixtures.operatorCodes.push(codeId);
    await db
      .insertInto('introductory_operator_codes')
      .values({
        id: codeId,
        billing_account_id: t.accountId,
        code_sha256: createHash('sha256').update(code).digest('hex'),
        created_at: new Date(),
        created_by_user_id: t.userId,
        email_normalized: null,
        expires_at: new Date(Date.now() + 3600_000),
        reason: 'fixture waiver',
        redemption_count: 0,
        redemption_limit: 1,
        waiver_scope: 'oauth_verified_work_email',
      })
      .execute();
    const offer = await offerRead(db, t.workspaceId, new Date());
    const request = {
      campaign_id: offer.campaign_id,
      terms_consent: true,
      data_sharing_consent: true,
      operator_code: code,
    };
    await expect(
      claimOffer(db, other.workspaceId, other.userId, request, randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    const key = randomUUID();
    const claim = await claimOffer(db, t.workspaceId, t.userId, request, key);
    expect(await claimOffer(db, t.workspaceId, t.userId, request, key)).toEqual(claim);
    expect(
      (
        await db
          .selectFrom('introductory_operator_codes')
          .select('redemption_count')
          .where('id', '=', codeId)
          .executeTakeFirstOrThrow()
      ).redemption_count,
    ).toBe(1);
    await expect(
      claimOffer(db, t.workspaceId, t.userId, { ...request, operator_code: randomUUID() }, key),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('serializes lifetime no-card claims, requires both consents, and ending cannot reset eligibility', async () => {
    await fixtures.catalog((payload) => {
      payload.campaign.state = 'enabled';
      payload.campaign.enabled = true;
      payload.campaign.claim_available = true;
      payload.campaign.cohort_started_at = new Date(Date.now() - 86_400_000).toISOString();
    });
    const t = await fixtures.tenant();
    const offer = await offerRead(db, t.workspaceId, new Date());
    const request = {
      campaign_id: offer.campaign_id,
      terms_consent: true,
      data_sharing_consent: true,
      operator_code: null,
    };
    await expect(
      claimOffer(
        db,
        t.workspaceId,
        t.userId,
        { ...request, data_sharing_consent: false },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const key = randomUUID();
    const claims = await Promise.all([
      claimOffer(db, t.workspaceId, t.userId, request, key),
      claimOffer(db, t.workspaceId, t.userId, request, key),
    ]);
    expect(claims[0]).toEqual(claims[1]);
    await endOffer(db, t.workspaceId, t.userId, randomUUID());
    await expect(
      claimOffer(db, t.workspaceId, t.userId, request, randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    expect((await offerRead(db, t.workspaceId, new Date())).status).toBe('already_claimed');
  });
});
