import { randomUUID } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import type { BillingPayments } from '../generated/db-schema.ts';
import { amount, conflict, digest, taxSnapshotSchema, type Pending } from './contracts.ts';
import { roundedRatio, type Quote } from './quotes.ts';
import type { PaymentEvidence, RefundEvidence } from './razorpay.ts';
import { revokeBundle, lockAccount } from '../entitlements/grants.ts';

type Payment = Selectable<BillingPayments>;
const components = ['taxable_minor', 'cgst_minor', 'sgst_minor', 'igst_minor'] as const;
const invoiceAmounts = z.object({
  subtotal_minor: amount,
  discount_minor: amount,
  taxable_minor: amount,
  cgst_minor: amount,
  sgst_minor: amount,
  igst_minor: amount,
  tax_minor: amount,
  total_minor: amount,
  currency: z.string(),
  tax_rate: z.string(),
  tax_treatment: z.string(),
});

function invoiceDay(at: Date): { day: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(fields.year) - (Number(fields.month) < 4 ? 1 : 0);
  return {
    day: `${fields.year}-${fields.month}-${fields.day}`,
    year: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
  };
}

async function numbers(db: Database, at: Date, prefix: string, credit: boolean) {
  if (!/^[A-Z0-9]{1,3}$/u.test(prefix)) conflict('invoice_prefix_invalid');
  const { day, year } = invoiceDay(at);
  const series = credit ? `CN:${year}` : year;
  await db
    .insertInto('billing_invoice_counters')
    .values({ financial_year: series, next_value: 1 })
    .onConflict((c) => c.column('financial_year').doNothing())
    .execute();
  const counter = await db
    .updateTable('billing_invoice_counters')
    .set({ next_value: sql`next_value + 1` })
    .where('financial_year', '=', series)
    .returning('next_value')
    .executeTakeFirstOrThrow();
  const serial = String(counter.next_value - 1).padStart(6, '0');
  const suffix = `${year.slice(2, 4)}${year.slice(-2)}/${serial}`;
  const invoice = `${prefix}${credit ? 'C' : ''}/${suffix}`;
  const receipt = credit ? invoice : `${prefix}R/${suffix}`;
  if (invoice.length > 16 || receipt.length > 16) conflict('invoice_number_too_long');
  return { day, year, invoice, receipt };
}

async function insertInvoice(
  db: Database,
  payment: Payment,
  numbered: Awaited<ReturnType<typeof numbers>>,
  payload: Record<string, unknown>,
  kind: string,
) {
  const amounts = invoiceAmounts.parse(payload.amounts);
  return db
    .insertInto('billing_invoices')
    .values({
      id: randomUUID(),
      billing_account_id: payment.billing_account_id,
      payment_id: payment.id,
      invoice_number: numbered.invoice,
      receipt_number: numbered.receipt,
      financial_year: numbered.year,
      document_kind: kind,
      invoice_date: new Date(`${numbered.day}T00:00:00Z`),
      paid_at: payment.paid_at!,
      currency: payment.currency,
      total_amount_minor: payment.amount_minor,
      tax_treatment: amounts.tax_treatment,
      tax_policy_version: 1,
      payload: JSON.stringify(payload),
      payload_sha256: digest(payload),
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function recordPayment(
  db: Database,
  pending: Pending,
  evidence: PaymentEvidence,
  quote: Quote,
  taxSnapshot: unknown,
  subscriptionId: string | null,
  label: string,
) {
  const snapshot = taxSnapshotSchema.parse(taxSnapshot);
  const tax = snapshot.tax;
  if (
    evidence.amount !== tax.total_minor ||
    evidence.amount !== quote.total_price.amount_minor ||
    evidence.currency !== quote.total_price.currency
  )
    conflict('payment_amount_mismatch');
  const fingerprint = digest({
    account: pending.billing_account_id,
    pending: pending.id,
    subscriptionId,
    evidence,
  });
  const existing = await db
    .selectFrom('billing_payments')
    .selectAll()
    .where('provider', '=', pending.provider)
    .where('provider_mode', '=', pending.provider_mode)
    .where('receipt_kind', '=', 'payment')
    .where('external_payment_id', '=', evidence.id)
    .forUpdate()
    .executeTakeFirst();
  if (existing) {
    if (
      existing.billing_account_id !== pending.billing_account_id ||
      existing.pending_activation_id !== pending.id ||
      existing.subscription_id !== subscriptionId ||
      existing.amount_minor !== evidence.amount ||
      existing.currency !== evidence.currency ||
      existing.external_order_id !== evidence.orderId ||
      existing.external_invoice_id !== evidence.invoiceId ||
      existing.period_start?.getTime() !== evidence.periodStart?.getTime() ||
      existing.period_end?.getTime() !== evidence.periodEnd?.getTime() ||
      existing.paid_at?.getTime() !== evidence.paidAt.getTime() ||
      existing.payment_method !== evidence.method ||
      existing.status !== 'paid'
    )
      conflict('payment_receipt_conflict');
    return existing;
  }
  const payment = await db
    .insertInto('billing_payments')
    .values({
      id: randomUUID(),
      billing_account_id: pending.billing_account_id,
      pending_activation_id: pending.id,
      subscription_id: subscriptionId,
      period_start: evidence.periodStart,
      period_end: evidence.periodEnd,
      provider: pending.provider,
      provider_mode: pending.provider_mode,
      receipt_kind: 'payment',
      external_payment_id: evidence.id,
      external_order_id: evidence.orderId,
      external_invoice_id: evidence.invoiceId,
      external_refund_id: null,
      parent_payment_id: null,
      amount_minor: evidence.amount,
      currency: evidence.currency,
      payment_method: evidence.method,
      status: 'paid',
      paid_at: evidence.paidAt,
      receipt_sha256: fingerprint,
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const customer = await db
    .selectFrom('billing_accounts')
    .innerJoin('users', 'users.id', 'billing_accounts.owner_user_id')
    .select('users.email')
    .where('billing_accounts.id', '=', pending.billing_account_id)
    .executeTakeFirst();
  if (!customer) conflict('invoice_customer_email_missing');
  const numbered = await numbers(db, evidence.paidAt, snapshot.seller.invoice_prefix ?? '', false);
  const kind = pending.country_code === 'IN' ? 'gst_tax_receipt' : 'export_receipt';
  const amounts = { ...tax, currency: evidence.currency, tax_treatment: tax.treatment };
  const payload = {
    schema_version: 1,
    document_kind: kind,
    invoice_number: numbered.invoice,
    receipt_number: numbered.receipt,
    invoice_date: numbered.day,
    paid_at: evidence.paidAt.toISOString(),
    seller: snapshot.seller,
    customer: { ...snapshot.customer, country_code: pending.country_code, email: customer.email },
    line: {
      description: `CiteLadder ${label}${pending.activation_kind === 'base' ? ' subscription' : pending.activation_kind === 'upgrade' ? ' upgrade (prorated)' : pending.activation_kind === 'addon' ? ' add-on' : ' top-up'}`,
      quantity: pending.quantity,
      unit_price_minor: Math.floor(tax.subtotal_minor / pending.quantity),
      amount_minor: tax.subtotal_minor,
      period_start: evidence.periodStart?.toISOString() ?? null,
      period_end: evidence.periodEnd?.toISOString() ?? null,
      sac: snapshot.seller.sac,
    },
    amounts,
    payment: {
      method: evidence.method || 'Online payment',
      provider: pending.provider,
      receipt_number: numbered.receipt,
    },
    provenance: {
      payment_receipt_sha256: fingerprint,
      quote_id: quote.quote_id,
      catalog_revision: quote.catalog_revision,
      tax_policy_version: 1,
    },
  };
  await insertInvoice(db, payment, numbered, payload, kind);
  return payment;
}

export function creditAmounts(
  original: z.infer<typeof invoiceAmounts>,
  credited: ReadonlyMap<string, number>,
  refunded: number,
) {
  const remaining = Object.fromEntries(
    components.map((key) => [key, original[key] - (credited.get(key) ?? 0)]),
  );
  const taxLeft = remaining.cgst_minor! + remaining.sgst_minor! + remaining.igst_minor!;
  const total = remaining.taxable_minor! + taxLeft;
  if (refunded <= 0 || refunded > total) conflict('credit_note_amount_invalid');
  if (refunded === total)
    return {
      ...original,
      subtotal_minor: remaining.taxable_minor!,
      discount_minor: 0,
      ...remaining,
      tax_minor: taxLeft,
      total_minor: refunded,
    };
  const taxable = Math.max(
    roundedRatio(BigInt(refunded) * BigInt(remaining.taxable_minor!), BigInt(total)),
    refunded - taxLeft,
  );
  const tax = refunded - taxable;
  let cgst = 0,
    sgst = 0,
    igst = 0;
  if (original.tax_treatment === 'IGST') igst = tax;
  else if (original.tax_treatment === 'CGST_SGST') {
    cgst = Math.min(Math.floor(tax / 2), remaining.cgst_minor!);
    sgst = Math.min(tax - cgst, remaining.sgst_minor!);
    cgst = tax - sgst;
  } else if (tax) conflict('credit_note_tax_invalid');
  return {
    ...original,
    subtotal_minor: taxable,
    discount_minor: 0,
    taxable_minor: taxable,
    cgst_minor: cgst,
    sgst_minor: sgst,
    igst_minor: igst,
    tax_minor: tax,
    total_minor: refunded,
  };
}

export async function recordRefund(
  db: Database,
  workspaceId: string,
  accountId: string,
  provider: string,
  mode: string,
  refund: RefundEvidence,
) {
  if (refund.status !== 'processed') return;
  await lockAccount(db, workspaceId, accountId);
  const payment = await db
    .selectFrom('billing_payments')
    .selectAll()
    .where('billing_account_id', '=', accountId)
    .where('provider', '=', provider)
    .where('provider_mode', '=', mode)
    .where('receipt_kind', '=', 'payment')
    .where('external_payment_id', '=', refund.paymentId)
    .forUpdate()
    .executeTakeFirst();
  if (!payment) conflict('refund_payment_missing');
  const prior = await db
    .selectFrom('billing_payments')
    .selectAll()
    .where('provider', '=', provider)
    .where('provider_mode', '=', mode)
    .where('external_refund_id', '=', refund.id)
    .executeTakeFirst();
  const fingerprint = digest(refund);
  if (prior) {
    if (
      prior.amount_minor !== refund.amount ||
      prior.status !== refund.status ||
      prior.parent_payment_id !== payment.id
    )
      conflict('refund_receipt_conflict');
    return;
  }
  const previous = await db
    .selectFrom('billing_payments')
    .select(sql<string>`coalesce(sum(amount_minor),0)`.as('total'))
    .where('parent_payment_id', '=', payment.id)
    .where('receipt_kind', '=', 'refund')
    .executeTakeFirstOrThrow();
  const total = Number(previous.total) + refund.amount;
  if (total > payment.amount_minor) conflict('refund_amount_exceeds_payment');
  const original = await db
    .selectFrom('billing_invoices')
    .selectAll()
    .where('payment_id', '=', payment.id)
    .executeTakeFirstOrThrow();
  const payload = jsonObject(original.payload, 'billing_invoices.payload');
  const seller = z.record(z.string(), z.string()).parse(payload.seller);
  const notes = await db
    .selectFrom('billing_invoices')
    .select('payload')
    .where('billing_account_id', '=', accountId)
    .where('document_kind', '=', 'credit_note')
    .where(sql<string>`payload->>'original_invoice_number'`, '=', original.invoice_number)
    .execute();
  const credited = new Map<string, number>();
  for (const note of notes) {
    const values = invoiceAmounts.parse(
      jsonObject(note.payload, 'billing_invoices.payload').amounts,
    );
    for (const key of components) credited.set(key, (credited.get(key) ?? 0) + values[key]);
  }
  const amounts = creditAmounts(invoiceAmounts.parse(payload.amounts), credited, refund.amount);
  const receipt = await db
    .insertInto('billing_payments')
    .values({
      ...payment,
      id: randomUUID(),
      receipt_kind: 'refund',
      external_refund_id: refund.id,
      parent_payment_id: payment.id,
      amount_minor: refund.amount,
      paid_at: refund.createdAt,
      status: 'processed',
      receipt_sha256: fingerprint,
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const numbered = await numbers(db, refund.createdAt, seller.invoice_prefix ?? '', true);
  await insertInvoice(
    db,
    receipt,
    numbered,
    {
      ...payload,
      document_kind: 'credit_note',
      original_invoice_number: original.invoice_number,
      invoice_number: numbered.invoice,
      receipt_number: numbered.receipt,
      invoice_date: numbered.day,
      paid_at: refund.createdAt.toISOString(),
      amounts,
      provenance: {
        ...jsonObject(payload.provenance, 'invoice.provenance'),
        refund_receipt_sha256: fingerprint,
      },
    },
    'credit_note',
  );
  if (total === payment.amount_minor) {
    let query = db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', accountId);
    query = payment.subscription_id
      ? query
          .where('source_ref', '=', `subscription:${payment.subscription_id}`)
          .where('period_start', '=', payment.period_start)
          .where('period_end', '=', payment.period_end)
      : query.where('source_ref', '=', `activation:${payment.pending_activation_id}`);
    const grants = await query.execute();
    await revokeBundle(db, {
      workspaceId,
      accountId,
      grantIds: grants.map((row) => row.id),
      key: `refund:${payment.id}:full`,
      reason: 'full_refund',
      actorKind: 'provider',
      actorId: null,
      at: refund.createdAt,
    });
  }
}
