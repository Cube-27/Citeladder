import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { policy } from '../config.ts';
import { amount, conflict, type Pending } from './contracts.ts';
import type { BillingSettings, RazorpaySettings } from './config.ts';

const reference = z
  .string()
  .regex(/^[a-z]+_[A-Za-z0-9]+$/u)
  .max(255);
const notes = z
  .union([z.record(z.string(), z.string()), z.array(z.never()).length(0), z.null()])
  .optional()
  .transform((value) => (value && !Array.isArray(value) ? value : {}));
const subscriptionSchema = z.object({
  id: reference,
  status: z.string(),
  plan_id: reference,
  current_start: amount.nullish(),
  current_end: amount.nullish(),
  updated_at: amount.optional().default(0),
  cancel_at_cycle_end: z
    .union([z.boolean(), z.literal(0), z.literal(1)])
    .optional()
    .default(false),
  notes,
});
const paymentSchema = z.object({
  id: reference,
  status: z.string(),
  amount,
  currency: z.enum(['USD', 'INR']),
  created_at: amount,
  paid_at: amount.nullish(),
  invoice_id: reference.nullish(),
  order_id: reference.nullish(),
  method: z.string().optional().default(''),
  notes,
});
const refundSchema = z.object({
  id: reference,
  payment_id: reference,
  amount: amount.min(1),
  status: z.string(),
  created_at: amount,
});
export type PaymentEvidence = {
  id: string;
  orderId: string | null;
  invoiceId: string | null;
  amount: number;
  currency: 'USD' | 'INR';
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  taxMinor: number | null;
  method: string;
};
export type SubscriptionEvidence = {
  id: string;
  status: string;
  priceRef: string;
  start: Date | null;
  end: Date | null;
  version: number;
  cancelAtEnd: boolean;
  notes: Record<string, string>;
  payment: PaymentEvidence | null;
};
export type RefundEvidence = {
  id: string;
  paymentId: string;
  amount: number;
  status: string;
  createdAt: Date;
};
export type Evidence =
  | { kind: 'base'; subscription: SubscriptionEvidence }
  | {
      kind: 'payment';
      payment: PaymentEvidence | null;
      reference: string;
      notes: Record<string, string>;
      failed?: boolean;
    };
export interface BillingProvider {
  mode: 'test' | 'live';
  create(pending: Pending): Promise<string>;
  recover(pending: Pending): Promise<string | null>;
  evidence(reference: string, base: boolean): Promise<Evidence>;
  cancel(reference: string, atEnd: boolean): Promise<SubscriptionEvidence>;
  change(reference: string, priceRef: string): Promise<void>;
  refund(reference: string): Promise<RefundEvidence>;
}

function basicCredentials(keyId: string, keySecret: string) {
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export class ProviderError extends Error {
  readonly uncertain: boolean;
  constructor(uncertain: boolean, message = 'provider_unavailable') {
    super(message);
    this.uncertain = uncertain;
  }
}

export function configured(
  settings: RazorpaySettings,
): settings is RazorpaySettings & { mode: 'test' | 'live' } {
  return (
    settings.mode !== 'disabled' &&
    !settings.conflicting &&
    settings.origin === policy.billing.razorpay_origin &&
    settings.keyId.startsWith(`rzp_${settings.mode}_`) &&
    Boolean(settings.keySecret) &&
    !(settings.mode === 'test' && settings.production)
  );
}

export function checkoutAvailable(
  settings: BillingSettings,
  adapter: RazorpaySettings,
  region: string,
): boolean {
  const independent =
    settings.quoteSecret &&
    ![adapter.keySecret, adapter.webhookSecret, adapter.previousSecret].includes(
      settings.quoteSecret,
    );
  return (
    Boolean(independent) &&
    settings.enabled &&
    settings.provider === 'razorpay' &&
    configured(adapter) &&
    adapter.ready &&
    (region === 'international'
      ? adapter.internationalReady
      : adapter.mode === 'live' || adapter.indiaReady)
  );
}

function subscription(data: unknown): SubscriptionEvidence {
  const row = subscriptionSchema.parse(data);
  const statuses: Record<string, string> = policy.billing.contracts.razorpay_status_map;
  const status = statuses[row.status];
  if (!status) throw new ProviderError(true, 'provider_invalid_response');
  return {
    id: row.id,
    status,
    priceRef: row.plan_id,
    start: row.current_start == null ? null : new Date(row.current_start * 1000),
    end: row.current_end == null ? null : new Date(row.current_end * 1000),
    version: row.updated_at,
    cancelAtEnd: Boolean(row.cancel_at_cycle_end),
    notes: row.notes,
    payment: null,
  };
}

function payment(data: unknown): PaymentEvidence | null {
  const row = paymentSchema.parse(data);
  const statuses: Record<string, string> = policy.billing.contracts.razorpay_payment_status_map;
  if (!statuses[row.status]) throw new ProviderError(true, 'provider_invalid_response');
  if (statuses[row.status] !== 'paid') return null;
  return {
    id: row.id,
    orderId: row.order_id ?? null,
    invoiceId: row.invoice_id ?? null,
    amount: row.amount,
    currency: row.currency,
    paidAt: new Date((row.paid_at ?? row.created_at) * 1000),
    periodStart: null,
    periodEnd: null,
    taxMinor: null,
    method: row.method,
  };
}

export class RazorpayProvider implements BillingProvider {
  readonly mode: 'test' | 'live';
  private readonly shared: BillingSettings;
  private readonly adapter: RazorpaySettings;
  private readonly transport: typeof fetch;
  constructor(shared: BillingSettings, adapter: RazorpaySettings, transport: typeof fetch = fetch) {
    if (!configured(adapter)) conflict('checkout_unavailable');
    this.shared = shared;
    this.adapter = adapter;
    this.transport = transport;
    this.mode = adapter.mode;
  }
  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.transport(`${policy.billing.razorpay_origin}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(this.shared.timeoutMs),
        headers: {
          authorization: `Basic ${basicCredentials(this.adapter.keyId, this.adapter.keySecret)}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ProviderError(true);
    }
    if (!response.ok)
      throw new ProviderError(
        response.status === 429 || response.status >= 500,
        'provider_rejected',
      );
    try {
      return z.record(z.string(), z.unknown()).parse(await response.json());
    } catch {
      throw new ProviderError(true, 'provider_invalid_response');
    }
  }
  private async collection(path: string) {
    const items: Record<string, unknown>[] = [];
    const count = this.shared.listCount;
    for (let page = 0; page < this.shared.maxPages; page++) {
      const response = await this.request(
        'GET',
        `${path}${path.includes('?') ? '&' : '?'}count=${count}&skip=${page * count}`,
      );
      const batch = z.array(z.record(z.string(), z.unknown())).parse(response.items);
      items.push(...batch);
      if (batch.length < count) return items;
    }
    throw new ProviderError(true, 'provider_collection_incomplete');
  }
  async create(pending: Pending): Promise<string> {
    const meta = {
      citeladder_intent_id: pending.id,
      citeladder_account_ref: pending.billing_account_id,
      citeladder_catalog_revision: pending.catalog_revision,
    };
    if (pending.activation_kind === 'base') {
      const data = await this.request('POST', '/subscriptions', {
        plan_id: pending.external_price_id,
        total_count: this.shared.cycles,
        quantity: 1,
        customer_notify: 1,
        notes: meta,
      });
      const row = subscription(data);
      if (row.priceRef !== pending.external_price_id)
        throw new ProviderError(true, 'provider_price_mismatch');
      return row.id;
    }
    const quote = z
      .object({ total_price: z.object({ amount_minor: amount, currency: z.string() }) })
      .parse(pending.quote);
    const data = await this.request('POST', '/orders', {
      amount: quote.total_price.amount_minor,
      currency: quote.total_price.currency,
      receipt: pending.id,
      notes: meta,
    });
    if (
      data.amount !== quote.total_price.amount_minor ||
      data.currency !== quote.total_price.currency
    )
      throw new ProviderError(true, 'provider_amount_mismatch');
    return reference.parse(data.id);
  }
  async recover(pending: Pending): Promise<string | null> {
    const matches = (
      await this.collection(pending.activation_kind === 'base' ? '/subscriptions' : '/orders')
    ).filter((row) => {
      const meta = notes.parse(row.notes);
      return (
        meta.citeladder_intent_id === pending.id &&
        meta.citeladder_account_ref === pending.billing_account_id
      );
    });
    if (matches.length > 1) throw new ProviderError(true, 'provider_reference_ambiguous');
    const [match] = matches;
    return match ? reference.parse(match.id) : null;
  }
  evidence(id: string, base: boolean): Promise<Evidence> {
    reference.parse(id);
    return base ? this.subscriptionEvidence(id) : this.orderEvidence(id);
  }

  private async orderEvidence(id: string): Promise<Evidence> {
    const order = await this.request('GET', `/orders/${id}`);
    if (order.id !== id) throw new ProviderError(true, 'provider_reference_mismatch');
    const data = await this.request('GET', `/orders/${id}/payments`);
    const attempts = z.array(paymentSchema).parse(data.items);
    const captures = attempts.map((row) => payment(row)).filter((row) => row !== null);
    if (captures.length > 1) throw new ProviderError(true, 'provider_payment_ambiguous');
    const capture = captures[0] ?? null;
    if (
      capture &&
      (capture.orderId !== id ||
        capture.amount !== order.amount ||
        capture.currency !== order.currency)
    )
      throw new ProviderError(true, 'provider_amount_mismatch');
    const failed =
      attempts.length > 0 &&
      attempts.every(
        (row) =>
          policy.billing.contracts.razorpay_payment_status_map[
            row.status as keyof typeof policy.billing.contracts.razorpay_payment_status_map
          ] === 'payment_failed',
      );
    return {
      kind: 'payment',
      payment: capture,
      reference: id,
      notes: notes.parse(order.notes),
      failed,
    };
  }

  private async subscriptionEvidence(id: string): Promise<Evidence> {
    const sub = subscription(await this.request('GET', `/subscriptions/${id}`));
    if (sub.id !== id) throw new ProviderError(true, 'provider_reference_mismatch');
    const invoices = await this.collection(`/invoices?subscription_id=${encodeURIComponent(id)}`);
    const matches = invoices.filter(
      (row) =>
        row.subscription_id === id &&
        row.status === 'paid' &&
        row.billing_start === (sub.start?.getTime() ?? 0) / 1000 &&
        row.billing_end === (sub.end?.getTime() ?? 0) / 1000 &&
        typeof row.payment_id === 'string',
    );
    if (matches.length > 1) throw new ProviderError(true, 'provider_invoice_ambiguous');
    const [invoice] = matches;
    if (invoice) {
      const capture = payment(
        await this.request('GET', `/payments/${reference.parse(invoice.payment_id)}`),
      );
      if (
        !capture ||
        capture.invoiceId !== invoice.id ||
        invoice.amount_paid !== capture.amount ||
        invoice.amount_due !== 0 ||
        invoice.currency !== capture.currency
      )
        throw new ProviderError(true, 'provider_invoice_mismatch');
      sub.payment = {
        ...capture,
        paidAt: new Date(amount.parse(invoice.paid_at) * 1000),
        periodStart: sub.start,
        periodEnd: sub.end,
        taxMinor: invoice.tax_amount === undefined ? null : amount.parse(invoice.tax_amount),
      };
    }
    return { kind: 'base', subscription: sub };
  }
  async cancel(id: string, atEnd: boolean) {
    reference.parse(id);
    return subscription(
      await this.request('POST', `/subscriptions/${id}/cancel`, {
        cancel_at_cycle_end: Number(atEnd),
      }),
    );
  }
  async change(id: string, priceRef: string) {
    reference.parse(id);
    reference.parse(priceRef);
    await this.request('PATCH', `/subscriptions/${id}`, {
      plan_id: priceRef,
      schedule_change_at: 'cycle_end',
      customer_notify: 1,
    });
  }
  async refund(id: string) {
    reference.parse(id);
    const row = refundSchema.parse(await this.request('GET', `/refunds/${id}`));
    if (row.id !== id) throw new ProviderError(true, 'provider_reference_mismatch');
    return {
      id: row.id,
      paymentId: row.payment_id,
      amount: row.amount,
      status: row.status,
      createdAt: new Date(row.created_at * 1000),
    };
  }
}

export function authenticateSignature(
  secret: string,
  bytes: string | Uint8Array,
  supplied: string,
): boolean {
  if (!secret || !/^[a-f0-9]{64}$/iu.test(supplied)) return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(bytes).digest(),
    Buffer.from(supplied, 'hex'),
  );
}

export function verifyCallback(
  settings: RazorpaySettings,
  stored: string,
  fields: Record<string, string>,
) {
  const order = stored.startsWith('order_');
  const schema = z
    .object({
      razorpay_payment_id: reference,
      razorpay_signature: z.string(),
      ...(order ? { razorpay_order_id: reference } : { razorpay_subscription_id: reference }),
    })
    .strict();
  const parsed = schema.safeParse(fields);
  if (
    !parsed.success ||
    fields[order ? 'razorpay_order_id' : 'razorpay_subscription_id'] !== stored ||
    !fields.razorpay_payment_id?.startsWith('pay_')
  )
    conflict('checkout_unavailable');
  const message = order
    ? `${stored}|${fields.razorpay_payment_id}`
    : `${fields.razorpay_payment_id}|${stored}`;
  if (!authenticateSignature(settings.keySecret, message, fields.razorpay_signature ?? ''))
    conflict('checkout_unavailable');
}
