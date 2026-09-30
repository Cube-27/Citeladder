import { describe, expect, it, vi } from 'vitest';
import {
  RazorpayProvider,
  checkoutAvailable,
  authenticateSignature,
  verifyCallback,
} from '../src/billing/razorpay.ts';
import { roundedRatio, quoteIntent } from '../src/billing/quotes.ts';
import { creditAmounts } from '../src/billing/receipts.ts';
import { baseRequest } from '../src/billing/purchases.ts';
import { billingConfig, buyer } from './billing-support.ts';
import { createHmac } from 'node:crypto';

describe('billing input and provider boundaries', () => {
  const config = billingConfig();
  it('rounds money with exact integers and refuses missing GST approval and export consent', () => {
    expect(roundedRatio(5n, 2n)).toBe(3);
    const input = {
      kind: 'base',
      key: 'tier_1',
      quantity: 1,
      country: 'IN',
      identity: { ...buyer, state_code: '27' },
      currency: 'INR',
      unitAmount: 101,
      priceRef: 'plan_fixture',
      revision: 'fixture',
      now: new Date(),
    } as const;
    const quote = quoteIntent(config.billing, input).quote;
    expect([
      quote.cgst.amount_minor,
      quote.sgst.amount_minor,
      quote.total_price.amount_minor,
    ]).toEqual([9, 9, 119]);
    expect(() => quoteIntent({ ...config.billing, gstRate: null }, input)).toThrow();
    expect(() =>
      quoteIntent(config.billing, {
        ...input,
        country: 'US',
        currency: 'USD',
        identity: { ...buyer, export_eligibility_attested: false },
      }),
    ).toThrow();
  });
  it.each([
    ['IGST', 0, 0, 18],
    ['CGST_SGST', 9, 9, 0],
  ] as const)(
    'keeps partial credit allocations within original %s components',
    (treatment, cgst, sgst, igst) => {
      const original = {
        subtotal_minor: 100,
        discount_minor: 0,
        taxable_minor: 100,
        cgst_minor: cgst,
        sgst_minor: sgst,
        igst_minor: igst,
        tax_minor: 18,
        total_minor: 118,
        currency: 'INR',
        tax_rate: '0.18',
        tax_treatment: treatment,
      };
      const credited = new Map<string, number>();
      for (const amount of [...Array<number>(18).fill(1), 100]) {
        const note = creditAmounts(original, credited, amount);
        expect(note.taxable_minor + note.cgst_minor + note.sgst_minor + note.igst_minor).toBe(
          amount,
        );
        for (const key of ['taxable_minor', 'cgst_minor', 'sgst_minor', 'igst_minor'] as const) {
          credited.set(key, (credited.get(key) ?? 0) + note[key]);
          expect(credited.get(key)).toBeLessThanOrEqual(original[key]);
        }
      }
      expect([...credited.values()].reduce((sum, value) => sum + value, 0)).toBe(118);
    },
  );
  it('refuses unsafe provider configuration before transport and keeps quote and gateway secrets separate', () => {
    const transport = vi.fn();
    for (const settings of [
      { ...config.razorpay, origin: 'https://attacker.example' },
      { ...config.razorpay, production: true },
      { ...config.razorpay, keyId: 'rzp_live_fixture' },
      { ...config.razorpay, conflicting: true },
    ])
      expect(() => new RazorpayProvider(config.billing, settings, transport)).toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(
      checkoutAvailable(
        { ...config.billing, quoteSecret: config.razorpay.webhookSecret },
        config.razorpay,
        'international',
      ),
    ).toBe(false);
    expect(
      checkoutAvailable(
        { ...config.billing, provider: 'missing' },
        config.razorpay,
        'international',
      ),
    ).toBe(false);
  });
  it('requires a captured payment bound to the paid subscription invoice and rejects ambiguous collections', async () => {
    const responses: Record<string, unknown> = {
      '/subscriptions/sub_fixture': {
        id: 'sub_fixture',
        plan_id: 'plan_fixture',
        status: 'active',
        current_start: 100,
        current_end: 200,
        updated_at: 300,
        notes: [],
      },
      '/invoices': {
        items: [
          {
            id: 'inv_fixture',
            subscription_id: 'sub_fixture',
            status: 'paid',
            billing_start: 100,
            billing_end: 200,
            payment_id: 'pay_fixture',
            amount_paid: 4900,
            amount_due: 0,
            currency: 'USD',
            paid_at: 150,
          },
        ],
      },
      '/payments/pay_fixture': {
        id: 'pay_fixture',
        status: 'captured',
        amount: 4900,
        currency: 'USD',
        created_at: 150,
        invoice_id: 'inv_fixture',
        notes: null,
      },
      '/refunds/rfnd_fixture': {
        id: 'rfnd_fixture',
        payment_id: 'pay_fixture',
        amount: 10,
        status: 'processed',
        created_at: 160,
      },
    };
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://api.razorpay.com');
      expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
      return Response.json(responses[url.pathname.replace('/v1', '')]);
    });
    const provider = new RazorpayProvider(config.billing, config.razorpay, transport);
    const evidence = await provider.evidence('sub_fixture', true);
    expect(evidence).toMatchObject({
      kind: 'base',
      subscription: {
        notes: {},
        payment: {
          id: 'pay_fixture',
          invoiceId: 'inv_fixture',
          amount: 4900,
          periodStart: new Date(100_000),
          periodEnd: new Date(200_000),
        },
      },
    });
    expect(await provider.refund('rfnd_fixture')).toMatchObject({
      paymentId: 'pay_fixture',
      amount: 10,
    });
    responses['/payments/pay_fixture'] = {
      ...(responses['/payments/pay_fixture'] as object),
      invoice_id: 'inv_other',
    };
    await expect(provider.evidence('sub_fixture', true)).rejects.toThrow(
      'provider_invoice_mismatch',
    );
    const invoice = (responses['/invoices'] as { items: object[] }).items[0]!;
    responses['/invoices'] = { items: [invoice, { ...invoice, id: 'inv_other' }] };
    await expect(provider.evidence('sub_fixture', true)).rejects.toThrow(
      'provider_invoice_ambiguous',
    );
    const bounded = new RazorpayProvider(
      { ...config.billing, listCount: 1, maxPages: 1 },
      config.razorpay,
      transport,
    );
    await expect(bounded.evidence('sub_fixture', true)).rejects.toThrow(
      'provider_collection_incomplete',
    );
  });
  it('authenticates exactly the stored checkout reference and never treats browser callbacks as paid evidence', () => {
    const fields = {
      razorpay_payment_id: 'pay_fixture',
      razorpay_subscription_id: 'sub_fixture',
      razorpay_signature: createHmac('sha256', config.razorpay.keySecret)
        .update('pay_fixture|sub_fixture')
        .digest('hex'),
    };
    expect(() => verifyCallback(config.razorpay, 'sub_fixture', fields)).not.toThrow();
    expect(() => verifyCallback(config.razorpay, 'sub_other', fields)).toThrow();
    expect(() =>
      verifyCallback(config.razorpay, 'sub_fixture', { ...fields, amount: '100' }),
    ).toThrow();
    expect(
      authenticateSignature(config.razorpay.keySecret, 'altered', fields.razorpay_signature),
    ).toBe(false);
  });
  it('validates billing facts and refuses browser amounts and invalid GST state codes', () => {
    const input = {
      catalog_key: 'tier_1',
      credential_mode: 'byok',
      country_code: ' us ',
      billing_name: buyer.name,
      billing_address_line1: buyer.address_line1,
      billing_city: buyer.city,
      billing_postal_code: buyer.postal_code,
      export_eligibility_attested: true,
    };
    expect(baseRequest.parse(input).country_code).toBe('US');
    expect(baseRequest.safeParse({ ...input, amount_minor: 100 }).success).toBe(false);
    expect(baseRequest.safeParse({ ...input, billing_state_code: '00' }).success).toBe(false);
  });
});
